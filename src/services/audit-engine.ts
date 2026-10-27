import { db, newId } from '../db/db';
import { chronologicalRecords, deriveReconciliation } from './reconciliation';
import { findTagTypoCandidates } from './tag-typos';
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

  const effective = effectiveCandidates.find((item) => !['pending', 'displaced', 'not_found', 'suspicious', 'invalid', 'unresolved'].includes(item.status)) ?? null;
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

export async function getPossibleTagTypos(auditId: string, tagNumber: string, observedAnimal: string | null) {
  if (!observedAnimal) return [];
  const assignments = await db.tagAssignments.where('[auditId+expectedAnimal]').equals([auditId, observedAnimal]).toArray();
  return findTagTypoCandidates(assignments, tagNumber, observedAnimal);
}

export async function classifyReading(
  auditId: string,
  tagNumber: string,
  assignment: TagAssignment | null,
  observedAnimal: string | null
): Promise<RecordStatus> {
  if (!observedAnimal) return 'unconfirmed';
  if (!assignment) {
    // Tag not found in registry. Check for possible registry typo before classifying as new.
    const typoCandidates = await getPossibleTagTypos(auditId, tagNumber, observedAnimal);
    if (typoCandidates.length) {
      // Strong evidence of registry error/typo. Physical tag takes precedence.
      return 'possible_typo';
    }
    return 'new_tag';
  }
  if (!assignment.expectedAnimal) return 'linked';
  if (assignment.expectedAnimal === observedAnimal) return 'correct';
  return 'reassignment';
}

async function getNextSequence(auditId: string) {
  const records = await db.auditRecords.where('auditId').equals(auditId).toArray();
  return records.reduce((max, record) => Math.max(max, record.sequence ?? 0), 0) + 1;
}

function statusForEffectiveRecord(status: RecordStatus): EffectiveTagStatus {
  if (status === 'correct') return 'confirmed';
  if (status === 'reassignment' || status === 'divergence' || status === 'possible_swap' || status === 'animal_not_in_base') return 'reassigned';
  if (status === 'linked' || status === 'tag_without_animal') return 'linked';
  if (status === 'tag_stored') return 'without_animal';
  if (status === 'new_tag' || status === 'tag_not_registered' || status === 'possible_typo') return 'new_tag';
  if (status === 'tag_not_found') return 'not_found';
  if (status === 'suspicious_tag') return 'suspicious';
  if (status === 'animal_without_ear_tag' || status === 'unconfirmed' || status === 'audit_conflict' || status === 'new_tag_conflict') return 'unresolved';
  return 'unresolved';
}

function reviewForStatus(status: RecordStatus): AuditRecord['reviewStatus'] {
  return status === 'correct' ? 'not_required' : 'open';
}

export function defaultOperationalAction(status: RecordStatus): OperationalAction {
  if (status === 'correct') return 'keep_tag';
  if (status === 'possible_swap') return 'swap_tags';
  if (status === 'reassignment' || status === 'divergence' || status === 'animal_not_in_base') return 'move_tag';
  if (status === 'tag_stored') return 'remove_tag';
  if (status === 'new_tag' || status === 'tag_not_registered' || status === 'possible_typo') return 'register_new_tag';
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

function statusForReconciledState(input: {
  assignment: TagAssignment | null;
  record: AuditRecord | null;
  finalAnimal: string | null;
  wasMarkedNotFound: boolean;
}): EffectiveTagStatus {
  if (input.wasMarkedNotFound && !input.record) return 'not_found';
  if (!input.record) {
    if (input.assignment?.validationStatus === 'invalid_tag') return 'invalid';
    if (input.assignment?.validationStatus === 'suspicious_tag') return 'suspicious';
    return 'pending';
  }
  if (input.record.status === 'tag_stored') return 'without_animal';
  if (!input.finalAnimal) return 'displaced';
  return statusForEffectiveRecord(input.record.status);
}

export async function rebuildEffectiveState(auditId: string) {
  const now = new Date().toISOString();
  const [assignments, records] = await Promise.all([
    db.tagAssignments.where('auditId').equals(auditId).toArray(),
    db.auditRecords.where('auditId').equals(auditId).toArray()
  ]);
  const reconciliation = deriveReconciliation(assignments, records);
  const latestAnimalWithoutEarTagByTag = new Map<string, AuditRecord>();
  for (const record of chronologicalRecords(records).filter((item) => item.status === 'animal_without_ear_tag' && item.isCurrent !== false)) {
    latestAnimalWithoutEarTagByTag.set(record.tagNumber, record);
  }
  const notFoundTags = new Set(
    records
      .filter((record) => record.status === 'tag_not_found' && record.isCurrent !== false)
      .map((record) => record.tagNumber)
  );

  await db.transaction('rw', db.effectiveTagAssignments, async () => {
    for (const state of reconciliation.states) {
      const unresolvedPhysicalRecord = state.record ? null : latestAnimalWithoutEarTagByTag.get(state.tagNumber) ?? null;
      await upsertEffective({
        auditId,
        tagNumber: state.tagNumber,
        originalAnimal: state.originalAnimal,
        effectiveAnimal: unresolvedPhysicalRecord ? state.originalAnimal : state.finalAnimal,
        status: unresolvedPhysicalRecord
          ? 'unresolved'
          : statusForReconciledState({
              assignment: state.assignment,
              record: state.record,
              finalAnimal: state.finalAnimal,
              wasMarkedNotFound: notFoundTags.has(state.tagNumber)
            }),
        sourceAssignmentId: state.assignment?.id ?? null,
        currentRecordId: state.record?.id ?? unresolvedPhysicalRecord?.id ?? null,
        relatedRecordId: state.record?.relatedRecordId ?? unresolvedPhysicalRecord?.relatedRecordId ?? null,
        now
      });
    }
  });

  return reconciliation;
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
}) {
  const now = new Date().toISOString();
  const id = newId('record');
  const sequence = await getNextSequence(input.auditId);
  let relatedRecordId: string | null = null;
  const isConfirmedReading = !['unconfirmed', 'audit_conflict', 'new_tag_conflict'].includes(input.status);
  const existingRecord = input.existingRecord;
  const shouldSupersedeCurrent = Boolean(existingRecord?.isCurrent && isConfirmedReading);
  const effectiveAnimal = input.observedAnimal ?? null;

  await db.transaction('rw', db.auditRecords, db.audits, async () => {
    if (shouldSupersedeCurrent) {
      await db.auditRecords.update(existingRecord!.id, { isCurrent: false, updatedAt: now, syncStatus: 'pending' });
    }

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
      operationalAction: input.operationalAction !== undefined ? input.operationalAction : defaultOperationalAction(input.status),
      actionNote: input.actionNote ?? null,
      scannedAt: now,
      createdAt: now,
      updatedAt: now,
      syncedAt: null,
      syncStatus: 'pending',
      source: input.source,
      isCurrent: input.status !== 'unconfirmed',
      supersedesRecordId: input.existingRecord?.id ?? null,
      pairId: null,
      relatedRecordId
    });

    await db.audits.update(input.auditId, {
      updatedAt: now,
      lastActivityAt: now,
      status: 'in_progress',
      pausedAt: undefined
    });
  });

  // Evidence has already been persisted. From here on, interpretation failures
  // must not remove the physical fact from the chronological history.
  try {
    // CRITICAL RULE: Unconfirmed readings MUST preserve existing effective state.
    // They are saved to history only, never alter effective assignments.
    const shouldUpdateEffective = input.status !== 'unconfirmed';
    if (!shouldUpdateEffective) return (await db.auditRecords.get(id))!;
    if (isConfirmedReading) await rebuildEffectiveState(input.auditId);
  } catch (err) {
    console.warn('Evidencia salva, mas a interpretacao efetiva falhou.', err);
  }

  return (await db.auditRecords.get(id))!;
}

export async function updateConfirmedTagAction(input: {
  auditId: string;
  recordId: string;
  action?: Extract<OperationalAction, 'keep_tag' | 'remove_tag' | 'replace_tag' | 'tag_out_of_use'>;
  actionNote?: string | null;
  note?: string | null;
}) {
  return db.transaction('rw', db.audits, db.auditRecords, db.tagAssignments, db.effectiveTagAssignments, async () => {
    const [audit, record] = await Promise.all([db.audits.get(input.auditId), db.auditRecords.get(input.recordId)]);
    if (!audit || audit.status === 'finished' || !record || record.auditId !== input.auditId || record.isCurrent === false || record.status !== 'correct') return null;
    const now = new Date().toISOString();
    const action = input.action ?? record.operationalAction ?? 'keep_tag';
    await db.auditRecords.update(record.id, {
      operationalAction: action,
      ...(input.actionNote !== undefined ? { actionNote: input.actionNote } : {}),
      ...(input.note !== undefined ? { note: input.note } : {}),
      reviewStatus: action === 'keep_tag' ? 'not_required' : 'open',
      updatedAt: now,
      syncStatus: 'pending'
    });
    await db.audits.update(input.auditId, { updatedAt: now, lastActivityAt: now });
    await rebuildEffectiveState(input.auditId);
    return (await db.auditRecords.get(record.id))!;
  });
}

export async function correctConfirmedReading(input: {
  auditId: string;
  originalRecord: AuditRecord;
  assignment: TagAssignment | null;
  observedAnimal: string;
}) {
  const observedAnimal = input.observedAnimal.trim();
  if (!observedAnimal || input.originalRecord.fieldDecision === 'could_not_confirm') return null;

  const status: RecordStatus = !input.assignment
    ? await classifyReading(input.auditId, input.originalRecord.tagNumber, null, observedAnimal)
    : input.originalRecord.expectedAnimal === observedAnimal
    ? 'correct'
    : ['new_tag', 'tag_not_registered'].includes(input.originalRecord.status)
      ? 'new_tag'
      : ['linked', 'tag_without_animal'].includes(input.originalRecord.status)
        ? 'linked'
        : 'reassignment';
  const corrected = await saveReading({
    auditId: input.auditId,
    tagNumber: input.originalRecord.tagNumber,
    assignment: input.assignment,
    expectedAnimal: input.originalRecord.expectedAnimal,
    observedAnimal,
    status,
    fieldDecision: 'confirmed_physical_animal',
    source: input.originalRecord.source,
    existingRecord: input.originalRecord,
    note: `Correcao de leitura. Evidencia anterior: ${input.originalRecord.id}.`,
    actionNote: status === 'correct' ? 'Correcao confirmada em campo: manter tag.' : 'Correcao confirmada em campo: atualizar movimento derivado.',
    operationalAction: defaultOperationalAction(status)
  });

  return corrected;
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
  await rebuildEffectiveState(record.auditId);

  return {
    kind: 'swap' as const,
    current: (await db.auditRecords.get(record.id))!,
    other: (await db.auditRecords.get(pair.id))!
  };
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
