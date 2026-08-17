import { db, newId } from '../db/db';
import type { AuditRecord, EffectiveTagAssignment, EffectiveTagStatus, RecordStatus, TagAssignment } from '../types/domain';

export type RelatedContext = {
  records: AuditRecord[];
  effectiveAssignments: EffectiveTagAssignment[];
  message: string | null;
};

export type AnimalTagContext = {
  assignment: TagAssignment | null;
  effective: EffectiveTagAssignment | null;
};

function recordOrder(record: AuditRecord) {
  return record.sequence ?? Number.MAX_SAFE_INTEGER;
}

function isOpenIssue(record: AuditRecord) {
  return record.isCurrent && record.status !== 'correct' && record.status !== 'unconfirmed';
}

export async function getCurrentRecord(auditId: string, tagNumber: string) {
  const records = await db.auditRecords.where('[auditId+tagNumber]').equals([auditId, tagNumber]).toArray();
  return records
    .filter((record) => record.isCurrent)
    .sort((a, b) => recordOrder(b) - recordOrder(a) || b.scannedAt.localeCompare(a.scannedAt))[0] ?? null;
}

export async function getEffectiveTag(auditId: string, tagNumber: string) {
  return db.effectiveTagAssignments.where('[auditId+tagNumber]').equals([auditId, tagNumber]).first();
}

export async function getAnimalTagContext(auditId: string, animal: string | null): Promise<AnimalTagContext> {
  if (!animal) return { assignment: null, effective: null };

  const [assignment, effectiveCandidates] = await Promise.all([
    db.tagAssignments.where('[auditId+expectedAnimal]').equals([auditId, animal]).first(),
    db.effectiveTagAssignments.where('[auditId+effectiveAnimal]').equals([auditId, animal]).toArray()
  ]);

  const effective = effectiveCandidates.find((item) => !['displaced', 'not_found', 'suspicious', 'invalid'].includes(item.status)) ?? null;
  return { assignment: assignment ?? null, effective };
}

export async function getRelatedContext(auditId: string, assignment: TagAssignment | null): Promise<RelatedContext> {
  if (!assignment?.expectedAnimal) return { records: [], effectiveAssignments: [], message: null };

  const [records, effectiveAssignments] = await Promise.all([
    db.auditRecords.where('auditId').equals(auditId).toArray(),
    db.effectiveTagAssignments.where('auditId').equals(auditId).toArray()
  ]);

  const relatedRecords = records.filter(
    (record) =>
      isOpenIssue(record) &&
      (record.expectedAnimal === assignment.expectedAnimal || record.observedAnimal === assignment.expectedAnimal)
  );

  const relatedEffective = effectiveAssignments.filter(
    (item) =>
      item.status === 'displaced' &&
      (item.originalAnimal === assignment.expectedAnimal || item.effectiveAnimal === assignment.expectedAnimal)
  );

  if (!relatedRecords.length && !relatedEffective.length) return { records: [], effectiveAssignments: [], message: null };

  const latest = [...relatedRecords].sort((a, b) => recordOrder(b) - recordOrder(a) || b.scannedAt.localeCompare(a.scannedAt))[0];
  return {
    records: relatedRecords,
    effectiveAssignments: relatedEffective,
    message: latest
      ? `Esta tag ou animal ja esta envolvido em alteracao nesta auditoria. Tag ${latest.tagNumber}; ${latest.expectedAnimal ?? 'sem cadastro'} -> ${latest.observedAnimal ?? 'nao confirmado'}; ${latest.status}.`
      : `Existe uma tag deslocada relacionada ao animal ${assignment.expectedAnimal}.`
  };
}

export async function observedAnimalExists(auditId: string, animal: string | null) {
  if (!animal) return false;
  return Boolean(await db.tagAssignments.where('[auditId+expectedAnimal]').equals([auditId, animal]).first());
}

export async function classifyReading(
  auditId: string,
  assignment: TagAssignment | null,
  observedAnimal: string | null
): Promise<RecordStatus> {
  if (!observedAnimal) return 'unconfirmed';
  const animalExists = await observedAnimalExists(auditId, observedAnimal);
  if (!assignment) return animalExists ? 'new_tag' : 'tag_not_registered';
  if (!assignment.expectedAnimal) return animalExists ? 'linked' : 'tag_without_animal';
  if (assignment.expectedAnimal === observedAnimal) return 'correct';
  return animalExists ? 'reassignment' : 'animal_not_in_base';
}

async function getNextSequence(auditId: string) {
  const records = await db.auditRecords.where('auditId').equals(auditId).toArray();
  return records.reduce((max, record) => Math.max(max, record.sequence ?? 0), 0) + 1;
}

function statusForEffectiveRecord(status: RecordStatus): EffectiveTagStatus {
  if (status === 'correct') return 'confirmed';
  if (status === 'reassignment' || status === 'divergence' || status === 'possible_swap') return 'reassigned';
  if (status === 'linked') return 'linked';
  if (status === 'new_tag') return 'new_tag';
  if (status === 'tag_not_found') return 'not_found';
  if (status === 'suspicious_tag' || status === 'possible_typo') return 'suspicious';
  if (status === 'unconfirmed' || status === 'audit_conflict') return 'unresolved';
  return 'unresolved';
}

function reviewForStatus(status: RecordStatus): AuditRecord['reviewStatus'] {
  return status === 'correct' ? 'not_required' : 'open';
}

async function upsertEffective(input: {
  auditId: string;
  tagNumber: string;
  originalAnimal: string | null;
  effectiveAnimal: string | null;
  status: EffectiveTagStatus;
  sourceAssignmentId: string | null;
  currentRecordId: string | null;
  relatedRecordId: string | null;
  now: string;
}) {
  const existing = await db.effectiveTagAssignments.where('[auditId+tagNumber]').equals([input.auditId, input.tagNumber]).first();
  const payload = {
    originalAnimal: input.originalAnimal,
    effectiveAnimal: input.effectiveAnimal,
    status: input.status,
    sourceAssignmentId: input.sourceAssignmentId,
    currentRecordId: input.currentRecordId,
    relatedRecordId: input.relatedRecordId,
    updatedAt: input.now,
    syncStatus: 'pending' as const
  };

  if (existing) {
    await db.effectiveTagAssignments.update(existing.id, payload);
    return existing.id;
  }

  const id = newId('effective');
  await db.effectiveTagAssignments.add({
    id,
    auditId: input.auditId,
    tagNumber: input.tagNumber,
    ...payload,
    syncedAt: null
  });
  return id;
}

export async function saveReading(input: {
  auditId: string;
  tagNumber: string;
  assignment: TagAssignment | null;
  expectedAnimal: string | null;
  observedAnimal: string | null;
  status: RecordStatus;
  fieldDecision: AuditRecord['fieldDecision'];
  source: AuditRecord['source'];
  existingRecord: AuditRecord | null;
  note?: string | null;
}) {
  const now = new Date().toISOString();
  const id = newId('record');
  const sequence = await getNextSequence(input.auditId);
  let relatedRecordId: string | null = null;

  await db.transaction('rw', db.auditRecords, db.effectiveTagAssignments, db.audits, async () => {
    if (input.existingRecord?.isCurrent) {
      await db.auditRecords.update(input.existingRecord.id, { isCurrent: false, updatedAt: now, syncStatus: 'pending' });
    }

    if (input.observedAnimal && input.status !== 'unconfirmed') {
      const occupied = (await db.effectiveTagAssignments.where('[auditId+effectiveAnimal]').equals([input.auditId, input.observedAnimal]).toArray())
        .find((item) => item.tagNumber !== input.tagNumber && !['displaced', 'not_found', 'suspicious', 'invalid'].includes(item.status));

      if (occupied) {
        relatedRecordId = occupied.currentRecordId;
        await db.effectiveTagAssignments.update(occupied.id, {
          status: 'displaced',
          effectiveAnimal: null,
          relatedRecordId: id,
          updatedAt: now,
          syncStatus: 'pending'
        });
      }
    }

    const effectiveAnimal = input.status === 'unconfirmed' ? input.expectedAnimal : input.observedAnimal ?? input.expectedAnimal;

    await db.auditRecords.add({
      id,
      auditId: input.auditId,
      sequence,
      tagNumber: input.tagNumber,
      expectedAnimal: input.expectedAnimal,
      observedAnimal: input.observedAnimal,
      effectiveAnimal,
      status: input.status,
      fieldDecision: input.fieldDecision,
      reviewStatus: reviewForStatus(input.status),
      note: input.note ?? null,
      scannedAt: now,
      createdAt: now,
      updatedAt: now,
      syncedAt: null,
      syncStatus: 'pending',
      source: input.source,
      isCurrent: true,
      supersedesRecordId: input.existingRecord?.id ?? null,
      pairId: null,
      relatedRecordId
    });

    await upsertEffective({
      auditId: input.auditId,
      tagNumber: input.tagNumber,
      originalAnimal: input.expectedAnimal,
      effectiveAnimal,
      status: statusForEffectiveRecord(input.status),
      sourceAssignmentId: input.assignment?.id ?? null,
      currentRecordId: id,
      relatedRecordId,
      now
    });

    await db.audits.update(input.auditId, {
      updatedAt: now,
      lastActivityAt: now,
      status: 'in_progress',
      pausedAt: undefined
    });
  });

  return (await db.auditRecords.get(id))!;
}

export async function detectReciprocalSwap(record: AuditRecord) {
  if (
    !['reassignment', 'divergence', 'possible_swap'].includes(record.status) ||
    !record.expectedAnimal ||
    !record.observedAnimal ||
    record.expectedAnimal === record.observedAnimal
  ) {
    return null;
  }

  const candidates = (await db.auditRecords.where('auditId').equals(record.auditId).toArray()).filter(
    (candidate) =>
      candidate.isCurrent &&
      candidate.id !== record.id &&
      ['reassignment', 'divergence', 'possible_swap'].includes(candidate.status) &&
      candidate.expectedAnimal === record.observedAnimal &&
      candidate.observedAnimal === record.expectedAnimal &&
      candidate.fieldDecision === 'confirmed_physical_animal'
  );

  const pair = candidates.sort((a, b) => recordOrder(b) - recordOrder(a) || b.scannedAt.localeCompare(a.scannedAt))[0];
  if (!pair) return null;

  const allRecords = await db.auditRecords.where('auditId').equals(record.auditId).toArray();
  const conflict = findSwapConflict(record, pair, allRecords);
  if (conflict) {
    const now = new Date().toISOString();
    const conflictId = newId('conflict');
    const note = conflictMessage(record, pair, conflict);

    await db.transaction('rw', db.auditRecords, db.effectiveTagAssignments, async () => {
      await db.auditRecords.update(record.id, {
        status: 'audit_conflict',
        pairId: conflictId,
        relatedRecordId: conflict.record.id,
        reviewStatus: 'open',
        note,
        updatedAt: now,
        syncStatus: 'pending'
      });
      await db.auditRecords.update(pair.id, {
        status: 'audit_conflict',
        pairId: conflictId,
        relatedRecordId: conflict.record.id,
        reviewStatus: 'open',
        note,
        updatedAt: now,
        syncStatus: 'pending'
      });
      for (const item of [record, pair]) {
        await db.effectiveTagAssignments.where('[auditId+tagNumber]').equals([item.auditId, item.tagNumber]).modify({
          status: 'unresolved',
          currentRecordId: item.id,
          relatedRecordId: conflict.record.id,
          updatedAt: now,
          syncStatus: 'pending'
        });
      }
    });

    return {
      kind: 'conflict' as const,
      current: (await db.auditRecords.get(record.id))!,
      other: (await db.auditRecords.get(pair.id))!,
      existing: conflict.record,
      message: note
    };
  }

  const pairId = pair.pairId ?? newId('swap');
  const now = new Date().toISOString();
  await db.transaction('rw', db.auditRecords, db.effectiveTagAssignments, async () => {
    await db.auditRecords.update(record.id, {
      status: 'possible_swap',
      pairId,
      relatedRecordId: pair.id,
      reviewStatus: 'open',
      updatedAt: now,
      syncStatus: 'pending'
    });
    await db.auditRecords.update(pair.id, {
      status: 'possible_swap',
      pairId,
      relatedRecordId: record.id,
      reviewStatus: 'open',
      updatedAt: now,
      syncStatus: 'pending'
    });
    await db.effectiveTagAssignments.where('[auditId+tagNumber]').equals([record.auditId, record.tagNumber]).modify({
      currentRecordId: record.id,
      relatedRecordId: pair.id,
      updatedAt: now,
      syncStatus: 'pending'
    });
    await db.effectiveTagAssignments.where('[auditId+tagNumber]').equals([pair.auditId, pair.tagNumber]).modify({
      currentRecordId: pair.id,
      relatedRecordId: record.id,
      updatedAt: now,
      syncStatus: 'pending'
    });
  });

  return {
    kind: 'swap' as const,
    current: (await db.auditRecords.get(record.id))!,
    other: (await db.auditRecords.get(pair.id))!
  };
}

function findSwapConflict(record: AuditRecord, pair: AuditRecord, allRecords: AuditRecord[]) {
  const attemptedAnimals = new Set([record.expectedAnimal, record.observedAnimal, pair.expectedAnimal, pair.observedAnimal].filter(Boolean));
  const attemptedTags = new Set([record.tagNumber, pair.tagNumber]);
  const currentPairId = pair.pairId ?? record.pairId ?? null;

  const confirmedSwapRecords = allRecords.filter(
    (candidate) =>
      candidate.status === 'possible_swap' &&
      candidate.pairId &&
      candidate.pairId !== currentPairId &&
      candidate.id !== record.id &&
      candidate.id !== pair.id
  );

  for (const candidate of confirmedSwapRecords) {
    const candidateAnimals = [candidate.expectedAnimal, candidate.observedAnimal].filter(Boolean);
    const animalConflict = candidateAnimals.find((animal) => attemptedAnimals.has(animal));
    const tagConflict = attemptedTags.has(candidate.tagNumber) ? candidate.tagNumber : null;
    if (animalConflict || tagConflict) {
      const sibling = confirmedSwapRecords.find((item) => item.pairId === candidate.pairId && item.id !== candidate.id) ?? null;
      return { record: candidate, sibling, animal: animalConflict ?? null, tag: tagConflict };
    }
  }

  return null;
}

function conflictMessage(record: AuditRecord, pair: AuditRecord, conflict: NonNullable<ReturnType<typeof findSwapConflict>>) {
  const existingLeft = conflict.record.expectedAnimal ?? conflict.record.observedAnimal ?? '?';
  const existingRight =
    conflict.sibling?.expectedAnimal === existingLeft
      ? conflict.sibling?.observedAnimal
      : conflict.sibling?.expectedAnimal ?? conflict.record.observedAnimal ?? '?';
  const attemptedLeft = record.expectedAnimal ?? pair.observedAnimal ?? '?';
  const attemptedRight = record.observedAnimal ?? pair.expectedAnimal ?? '?';
  const subject = conflict.animal
    ? `Animal ${conflict.animal} ja participa de uma troca confirmada.`
    : `Tag ${conflict.tag} ja participa de uma troca confirmada.`;

  return `${subject} Troca existente: ${existingLeft} <-> ${existingRight}. Nova ocorrencia detectada: ${attemptedLeft} <-> ${attemptedRight}. Revise as leituras antes de corrigir o cadastro.`;
}

export async function markPendingTagsNotFound(auditId: string) {
  const now = new Date().toISOString();
  const pending = (await db.effectiveTagAssignments.where('[auditId+status]').equals([auditId, 'pending']).toArray())
    .filter((item) => item.originalAnimal || item.tagNumber);
  if (!pending.length) return 0;

  await db.transaction('rw', db.auditRecords, db.effectiveTagAssignments, db.audits, async () => {
    let sequence = await getNextSequence(auditId);
    for (const item of pending) {
      const id = newId('record');
      await db.auditRecords.add({
        id,
        auditId,
        sequence,
        tagNumber: item.tagNumber,
        expectedAnimal: item.originalAnimal,
        observedAnimal: null,
        effectiveAnimal: null,
        status: 'tag_not_found',
        fieldDecision: 'review_later',
        reviewStatus: 'open',
        note: 'SmartTag valida da base nao localizada durante a auditoria.',
        scannedAt: now,
        createdAt: now,
        updatedAt: now,
        syncedAt: null,
        syncStatus: 'pending',
        source: 'manual',
        isCurrent: true,
        supersedesRecordId: null,
        pairId: null,
        relatedRecordId: null
      });
      await db.effectiveTagAssignments.update(item.id, {
        status: 'not_found',
        effectiveAnimal: null,
        currentRecordId: id,
        updatedAt: now,
        syncStatus: 'pending'
      });
      sequence += 1;
    }

    await db.audits.update(auditId, {
      updatedAt: now,
      lastActivityAt: now
    });
  });

  return pending.length;
}
