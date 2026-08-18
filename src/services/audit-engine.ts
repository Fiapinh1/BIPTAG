import { db, newId } from '../db/db';
import type { AuditRecord, EffectiveTagAssignment, EffectiveTagStatus, OperationalAction, RecordStatus, TagAssignment } from '../types/domain';

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
      ? `Esta tag ou animal ja possui uma leitura relacionada nesta auditoria. Tag ${latest.tagNumber}; cadastro ${latest.expectedAnimal ?? 'sem cadastro'}; campo ${latest.observedAnimal ?? 'nao confirmado'}.`
      : `Existe uma leitura relacionada ao animal ${assignment.expectedAnimal}.`
  };
}

export async function observedAnimalExists(auditId: string, animal: string | null) {
  if (!animal) return false;
  return Boolean(await db.tagAssignments.where('[auditId+expectedAnimal]').equals([auditId, animal]).first());
}

async function findSuspiciousMatch(auditId: string, tagNumber: string): Promise<TagAssignment | null> {
  // CRITICAL: Find potential typo/registry error only with strong confidence.
  // Physical evidence must not be silently replaced by incorrect registry.

  // Only numeric tags can match with typos
  if (!/^\d+$/.test(tagNumber)) return null;

  const suspiciousTags = await db.tagAssignments
    .where('auditId')
    .equals(auditId)
    .toArray()
    .then((tags) =>
      tags.filter((tag) => tag.validationStatus === 'suspicious_tag' && /^\d+$/.test(tag.tagNumber))
    );

  if (!suspiciousTags.length) return null;

  // Conservative similarity: same length + small difference
  const candidates = suspiciousTags.filter((suspicious) => {
    if (suspicious.tagNumber.length !== tagNumber.length) return false;

    // Count position differences
    let differences = 0;
    let maxConsecutiveDiff = 0;
    let currentConsecutiveDiff = 0;

    for (let i = 0; i < tagNumber.length; i++) {
      if (tagNumber[i] !== suspicious.tagNumber[i]) {
        differences++;
        currentConsecutiveDiff++;
        maxConsecutiveDiff = Math.max(maxConsecutiveDiff, currentConsecutiveDiff);
      } else {
        currentConsecutiveDiff = 0;
      }
    }

    // STRICT: Allow only 1-3 differences, concentrated in a few positions
    // Prefer matches concentrated in prefix (first 3-5 digits)
    if (differences > 3) return false;

    // Check if difference is concentrated in prefix (common typo location)
    const prefixLength = 7; // Typical SmartTag prefix length
    let prefixDifferences = 0;
    for (let i = 0; i < Math.min(prefixLength, tagNumber.length); i++) {
      if (tagNumber[i] !== suspicious.tagNumber[i]) prefixDifferences++;
    }

    // Strong match: concentrated in prefix OR very few total differences
    return differences <= 2 || (differences === 3 && prefixDifferences >= differences - 1);
  });

  // Return best candidate (closest match by differences)
  if (!candidates.length) return null;

  candidates.sort((a, b) => {
    let diffA = 0;
    let diffB = 0;
    for (let i = 0; i < a.tagNumber.length; i++) {
      if (a.tagNumber[i] !== tagNumber[i]) diffA++;
      if (b.tagNumber[i] !== tagNumber[i]) diffB++;
    }
    return diffA - diffB;
  });

  return candidates[0] ?? null;
}

export async function classifyReading(
  auditId: string,
  tagNumber: string,
  assignment: TagAssignment | null,
  observedAnimal: string | null
): Promise<RecordStatus> {
  if (!observedAnimal) return 'unconfirmed';
  const animalExists = await observedAnimalExists(auditId, observedAnimal);
  if (!assignment) {
    // Tag not found in registry. Check for possible registry typo before classifying as new.
    const suspiciousMatch = await findSuspiciousMatch(auditId, tagNumber);
    if (suspiciousMatch) {
      // Strong evidence of registry error/typo. Physical tag takes precedence.
      return 'possible_typo';
    }
    return animalExists ? 'new_tag' : 'tag_not_registered';
  }
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
  if (status === 'unconfirmed' || status === 'audit_conflict' || status === 'new_tag_conflict') return 'unresolved';
  return 'unresolved';
}

function reviewForStatus(status: RecordStatus): AuditRecord['reviewStatus'] {
  return status === 'correct' ? 'not_required' : 'open';
}

export function defaultOperationalAction(status: RecordStatus): OperationalAction {
  if (status === 'correct') return 'keep_tag';
  if (status === 'possible_swap') return 'swap_tags';
  if (status === 'new_tag') return 'register_new_tag';
  if (status === 'linked' || status === 'tag_without_animal') return 'link_tag';
  return 'investigate';
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
  operationalAction?: OperationalAction | null;
  actionNote?: string | null;
  preserveEffective?: boolean;
  keepExistingCurrent?: boolean;
}) {
  const now = new Date().toISOString();
  const id = newId('record');
  const sequence = await getNextSequence(input.auditId);
  let relatedRecordId: string | null = null;

  await db.transaction('rw', db.auditRecords, db.effectiveTagAssignments, db.audits, async () => {
    if (input.existingRecord?.isCurrent && !input.keepExistingCurrent) {
      await db.auditRecords.update(input.existingRecord.id, { isCurrent: false, updatedAt: now, syncStatus: 'pending' });
    }

    // CRITICAL RULE: Only confirmed readings can update effective state, displace tags, or trigger swaps.
    // Unconfirmed readings are saved to history but cannot alter physical evidence.
    const isConfirmedReading = !['unconfirmed', 'audit_conflict', 'new_tag_conflict'].includes(input.status);

    if (input.observedAnimal && isConfirmedReading) {
      const candidates = await db.effectiveTagAssignments.where('[auditId+effectiveAnimal]').equals([input.auditId, input.observedAnimal]).toArray();

      // Only displace tags that were physically confirmed in some location.
      // Tags never read in field (status='pending') must not be displaced.
      let occupied: EffectiveTagAssignment | undefined;
      for (const candidate of candidates) {
        if (candidate.tagNumber === input.tagNumber || ['displaced', 'not_found', 'suspicious', 'invalid'].includes(candidate.status)) {
          continue;
        }
        // Verify this tag was physically confirmed (has observedAnimal in currentRecord)
        if (candidate.currentRecordId) {
          const currentRecord = await db.auditRecords.get(candidate.currentRecordId);
          if (currentRecord?.observedAnimal) {
            occupied = candidate;
            break;
          }
        }
      }

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

    // CRITICAL RULE: effectiveAnimal preserves physical confirmation only.
    // No fallback to Nedap reference. Physical evidence must be explicit.
    const effectiveAnimal = input.observedAnimal ?? null;

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
      operationalAction: input.operationalAction ?? defaultOperationalAction(input.status),
      actionNote: input.actionNote ?? null,
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

    // CRITICAL RULE: Unconfirmed readings MUST preserve existing effective state.
    // They are saved to history only, never alter effective assignments.
    const shouldUpdateEffective = input.status !== 'unconfirmed' && !input.preserveEffective;

    if (shouldUpdateEffective) {
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
    }

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
  // CRITICAL: Swap requires TWO reciprocal physical confirmations.
  // Both records must be in field, confirmed by technician.
    // Unconfirmed readings (status='unconfirmed') NEVER trigger swaps.
  if (
    !['reassignment', 'divergence', 'possible_swap'].includes(record.status) ||
      record.status === 'unconfirmed' ||
    !record.expectedAnimal ||
    !record.observedAnimal ||
    record.expectedAnimal === record.observedAnimal ||
    record.fieldDecision !== 'confirmed_physical_animal' // NEW RECORD MUST BE PHYSICALLY CONFIRMED
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
      // CRITICAL: Candidate must also be physically confirmed and have observed location.
      candidate.fieldDecision === 'confirmed_physical_animal' &&
      candidate.observedAnimal !== null // Explicit check: candidate was physically read
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
        operationalAction: 'investigate',
        actionNote: note,
        updatedAt: now,
        syncStatus: 'pending'
      });
      await db.auditRecords.update(pair.id, {
        status: 'audit_conflict',
        pairId: conflictId,
        relatedRecordId: conflict.record.id,
        reviewStatus: 'open',
        note,
        operationalAction: 'investigate',
        actionNote: note,
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
      operationalAction: 'swap_tags',
      actionNote: 'Troca confirmada pela auditoria. Executar ajuste no Nedap depois.',
      updatedAt: now,
      syncStatus: 'pending'
    });
    await db.auditRecords.update(pair.id, {
      status: 'possible_swap',
      pairId,
      relatedRecordId: record.id,
      reviewStatus: 'open',
      operationalAction: 'swap_tags',
      actionNote: 'Troca confirmada pela auditoria. Executar ajuste no Nedap depois.',
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
        operationalAction: 'investigate',
        actionNote: 'Investigar tag nao localizada antes de corrigir o Nedap.',
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
