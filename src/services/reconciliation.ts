import type { AuditRecord, EffectiveTagAssignment, OperationalAction, TagAssignment } from '../types/domain';

export type ReconciledTagState = {
  tagNumber: string;
  originalAnimal: string | null;
  finalAnimal: string | null;
  assignment: TagAssignment | null;
  record: AuditRecord | null;
  action: OperationalAction | null;
};

export type ReconciledAnimalGap = {
  animal: string;
  originalTag: string;
  resolvedByTag: string | null;
  record: AuditRecord | null;
};

export type ReconciledSwapPair = {
  left: ReconciledTagState;
  right: ReconciledTagState;
};

export type ReconciliationResult = {
  states: ReconciledTagState[];
  stateByTag: Map<string, ReconciledTagState>;
  finalRecordByTag: Map<string, AuditRecord>;
  animalsWithoutConfirmedTag: ReconciledAnimalGap[];
  swapPairs: ReconciledSwapPair[];
};

export function isConfirmedEvidence(record: AuditRecord) {
  if (record.status === 'tag_stored') {
    return record.fieldDecision === 'tag_without_animal' || record.fieldDecision === 'confirmed_physical_animal';
  }
  if (record.status === 'animal_without_ear_tag') return false;
  return Boolean(record.observedAnimal) &&
    (record.fieldDecision === 'confirmed_physical_animal' || record.fieldDecision === 'confirmed_match') &&
    record.status !== 'unconfirmed' &&
    record.status !== 'tag_not_found' &&
    record.status !== 'audit_conflict' &&
    record.status !== 'new_tag_conflict';
}

export function chronologicalRecords(records: AuditRecord[]) {
  return [...records].sort((a, b) => {
    const sequenceDiff = (a.sequence ?? Number.MAX_SAFE_INTEGER) - (b.sequence ?? Number.MAX_SAFE_INTEGER);
    if (sequenceDiff !== 0) return sequenceDiff;
    return a.scannedAt.localeCompare(b.scannedAt);
  });
}

function finalAnimalForRecord(record: AuditRecord) {
  if (record.status === 'tag_stored') return null;
  if (record.operationalAction === 'remove_tag' || record.operationalAction === 'tag_out_of_use' || record.operationalAction === 'replace_tag') {
    return null;
  }
  return record.observedAnimal ?? null;
}

function actionForFinalState(assignment: TagAssignment | null, record: AuditRecord | null, finalAnimal: string | null): OperationalAction | null {
  if (!record) return null;
  if (record.status === 'tag_stored') return assignment?.expectedAnimal ? 'remove_tag' : null;
  if (record.operationalAction === 'remove_tag' || record.operationalAction === 'tag_out_of_use' || record.operationalAction === 'replace_tag') {
    return record.operationalAction;
  }
  if (!finalAnimal) return assignment?.expectedAnimal ? 'remove_tag' : null;
  if (!assignment) return record.status === 'possible_typo' ? 'register_new_tag' : 'register_new_tag';
  if (!assignment.expectedAnimal) return 'link_tag';
  if (assignment.expectedAnimal === finalAnimal) return null;
  return 'move_tag';
}

function isMovableState(state: ReconciledTagState) {
  return Boolean(
    state.originalAnimal &&
    state.finalAnimal &&
    state.originalAnimal !== state.finalAnimal &&
    state.record &&
    state.action === 'move_tag'
  );
}

function recordRank(record: AuditRecord | null) {
  if (!record) return Number.MIN_SAFE_INTEGER;
  return record.sequence ?? Date.parse(record.scannedAt) ?? Number.MIN_SAFE_INTEGER;
}

export function deriveReconciliation(assignments: TagAssignment[], records: AuditRecord[]): ReconciliationResult {
  const assignmentByTag = new Map(assignments.map((assignment) => [assignment.tagNumber, assignment]));
  const finalRecordByTag = new Map<string, AuditRecord>();

  for (const record of chronologicalRecords(records).filter(isConfirmedEvidence)) {
    finalRecordByTag.set(record.tagNumber, record);
  }

  const tags = new Set<string>([
    ...assignments.map((assignment) => assignment.tagNumber),
    ...finalRecordByTag.keys()
  ]);

  const states: ReconciledTagState[] = [];
  const stateByTag = new Map<string, ReconciledTagState>();
  for (const tagNumber of tags) {
    const assignment = assignmentByTag.get(tagNumber) ?? null;
    const record = finalRecordByTag.get(tagNumber) ?? null;
    const finalAnimal = record ? finalAnimalForRecord(record) : null;
    const state: ReconciledTagState = {
      tagNumber,
      originalAnimal: assignment?.expectedAnimal ?? null,
      finalAnimal,
      assignment,
      record,
      action: actionForFinalState(assignment, record, finalAnimal)
    };
    states.push(state);
    stateByTag.set(tagNumber, state);
  }

  const tagByFinalAnimal = new Map<string, string>();
  for (const state of states) {
    if (!state.finalAnimal) continue;
    const currentTag = tagByFinalAnimal.get(state.finalAnimal);
    const currentState = currentTag ? stateByTag.get(currentTag) : null;
    if (!currentState || recordRank(state.record) >= recordRank(currentState.record)) {
      tagByFinalAnimal.set(state.finalAnimal, state.tagNumber);
    }
  }

  const animalsWithoutConfirmedTag: ReconciledAnimalGap[] = [];
  const seenAnimals = new Set<string>();
  for (const state of states) {
    if (!state.assignment?.expectedAnimal || !state.record) continue;
    const originalAnimal = state.assignment.expectedAnimal;
    if (state.finalAnimal === originalAnimal) continue;
    if (tagByFinalAnimal.has(originalAnimal)) continue;
    if (seenAnimals.has(originalAnimal)) continue;
    seenAnimals.add(originalAnimal);
    animalsWithoutConfirmedTag.push({
      animal: originalAnimal,
      originalTag: state.tagNumber,
      resolvedByTag: null,
      record: state.record
    });
  }

  const swapPairs: ReconciledSwapPair[] = [];
  const pairedTags = new Set<string>();
  for (const state of states.filter(isMovableState)) {
    if (pairedTags.has(state.tagNumber) || !state.finalAnimal || !state.originalAnimal) continue;
    const candidateTag = tagByFinalAnimal.get(state.originalAnimal);
    if (!candidateTag || candidateTag === state.tagNumber || pairedTags.has(candidateTag)) continue;
    const candidate = stateByTag.get(candidateTag);
    if (!candidate || !candidate.finalAnimal || !candidate.originalAnimal) continue;
    if (candidate.originalAnimal === state.finalAnimal && candidate.finalAnimal === state.originalAnimal) {
      pairedTags.add(state.tagNumber);
      pairedTags.add(candidate.tagNumber);
      swapPairs.push({ left: state, right: candidate });
    }
  }

  return {
    states,
    stateByTag,
    finalRecordByTag,
    animalsWithoutConfirmedTag,
    swapPairs
  };
}

export function hasPhysicalEvidence(state: ReconciledTagState) {
  return Boolean(state.record && isConfirmedEvidence(state.record));
}

export function findStateForEffective(item: EffectiveTagAssignment, result: ReconciliationResult) {
  return result.stateByTag.get(item.tagNumber) ?? null;
}
