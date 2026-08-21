import 'fake-indexeddb/auto';

import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/db/db';
import type { Audit, AuditRecord, EffectiveTagAssignment, TagAssignment, TagValidationStatus } from '../src/types/domain';
import {
  classifyReading,
  correctConfirmedReading,
  detectReciprocalSwap,
  saveReading
} from '../src/services/audit-engine';

const AUDIT_ID = 'audit-test';

function now() {
  return new Date().toISOString();
}

async function resetDb() {
  await db.delete();
  await db.open();
}

async function seedAudit(assignmentsInput: Array<{
  tag: string;
  animal: string | null;
  validationStatus?: TagValidationStatus;
  effectiveAnimal?: string | null;
}>) {
  const timestamp = now();
  const audit: Audit = {
    id: AUDIT_ID,
    farmName: 'Teste',
    sourceFileName: 'Tags.xlsx',
    createdAt: timestamp,
    updatedAt: timestamp,
    lastActivityAt: timestamp,
    startedAt: timestamp,
    status: 'in_progress',
    totalTags: assignmentsInput.length,
    totalRows: assignmentsInput.length,
    validTags: assignmentsInput.filter((item) => (item.validationStatus ?? 'valid_tag') === 'valid_tag').length,
    suspiciousTags: assignmentsInput.filter((item) => item.validationStatus === 'suspicious_tag').length,
    invalidTags: assignmentsInput.filter((item) => item.validationStatus === 'invalid_tag').length,
    tagPattern: { prefix: '9840000', length: 15, numericOnly: true },
    linkedTags: assignmentsInput.filter((item) => item.animal).length,
    issueCount: 0
  };
  const assignments: TagAssignment[] = assignmentsInput.map((item, index) => ({
    id: `tag-${index}`,
    auditId: AUDIT_ID,
    tagNumber: item.tag,
    functionName: null,
    typeName: null,
    expectedAnimal: item.animal,
    connectedSince: null,
    lastDetectedAt: null,
    lastDetectedFarm: null,
    validationStatus: item.validationStatus ?? 'valid_tag',
    validationReason: null
  }));
  const effectiveRows: EffectiveTagAssignment[] = assignments.map((assignment, index) => ({
    id: `effective-${index}`,
    auditId: AUDIT_ID,
    tagNumber: assignment.tagNumber,
    originalAnimal: assignment.expectedAnimal,
    effectiveAnimal: assignmentsInput[index].effectiveAnimal ?? null,
    status: assignment.validationStatus === 'invalid_tag'
      ? 'invalid'
      : assignment.validationStatus === 'suspicious_tag'
        ? 'suspicious'
        : 'pending',
    sourceAssignmentId: assignment.id,
    currentRecordId: null,
    relatedRecordId: null,
    updatedAt: timestamp,
    syncedAt: null,
    syncStatus: 'pending'
  }));

  await db.transaction('rw', db.audits, db.tagAssignments, db.effectiveTagAssignments, async () => {
    await db.audits.add(audit);
    await db.tagAssignments.bulkAdd(assignments);
    await db.effectiveTagAssignments.bulkAdd(effectiveRows);
  });

  return { audit, assignments };
}

async function saveConfirmed(input: {
  tag: string;
  assignment: TagAssignment | null;
  observed: string | null;
  status?: AuditRecord['status'];
  existingRecord?: AuditRecord | null;
  keepExistingCurrent?: boolean;
}) {
  const status = input.status ?? await classifyReading(AUDIT_ID, input.tag, input.assignment, input.observed);
  return saveReading({
    auditId: AUDIT_ID,
    tagNumber: input.tag,
    assignment: input.assignment,
    expectedAnimal: input.assignment?.expectedAnimal ?? null,
    observedAnimal: input.observed,
    status,
    fieldDecision: status === 'correct' ? 'confirmed_match' : 'confirmed_physical_animal',
    source: 'manual',
    existingRecord: input.existingRecord ?? null,
    keepExistingCurrent: input.keepExistingCurrent
  });
}

beforeEach(async () => {
  await resetDb();
});

describe('BIPTAG audit rules', () => {
  it('A. treats Nedap as reference and does not displace an unread pending tag', async () => {
    const { assignments } = await seedAudit([
      { tag: '984000010514961', animal: '4199' },
      { tag: '984000010514962', animal: '4298', effectiveAnimal: '4298' }
    ]);

    const status = await classifyReading(AUDIT_ID, '984000010514961', assignments[0], '4298');
    const record = await saveConfirmed({ tag: '984000010514961', assignment: assignments[0], observed: '4298', status });

    const moved = await db.effectiveTagAssignments.where('[auditId+tagNumber]').equals([AUDIT_ID, '984000010514961']).first();
    const unread = await db.effectiveTagAssignments.where('[auditId+tagNumber]').equals([AUDIT_ID, '984000010514962']).first();
    expect(record.status).toBe('reassignment');
    expect(moved?.status).toBe('reassigned');
    expect(moved?.effectiveAnimal).toBe('4298');
    expect(unread?.status).toBe('pending');
    expect(unread?.currentRecordId).toBeNull();
  });

  it('B. closes a swap only after two reciprocal physical confirmations', async () => {
    const { assignments } = await seedAudit([
      { tag: '984000010514961', animal: '717' },
      { tag: '984000010514962', animal: '907' }
    ]);

    const first = await saveConfirmed({ tag: assignments[0].tagNumber, assignment: assignments[0], observed: '907' });
    expect(await detectReciprocalSwap(first)).toBeNull();

    const second = await saveConfirmed({ tag: assignments[1].tagNumber, assignment: assignments[1], observed: '717' });
    const swap = await detectReciprocalSwap(second);

    expect(swap?.kind).toBe('swap');
    const records = await db.auditRecords.where('auditId').equals(AUDIT_ID).toArray();
    expect(records.filter((record) => record.status === 'possible_swap')).toHaveLength(2);
    expect(records.every((record) => record.fieldDecision === 'confirmed_physical_animal')).toBe(true);
  });

  it('C. registers a conflict instead of confirming a second swap with the same animal', async () => {
    const { assignments } = await seedAudit([
      { tag: '984000010514961', animal: '717' },
      { tag: '984000010514962', animal: '907' },
      { tag: '984000010514963', animal: '288' }
    ]);

    const first = await saveConfirmed({ tag: assignments[0].tagNumber, assignment: assignments[0], observed: '907' });
    const second = await saveConfirmed({ tag: assignments[1].tagNumber, assignment: assignments[1], observed: '717' });
    await detectReciprocalSwap(second);

    const existingSwapRecord = (await db.auditRecords.get(first.id))!;
    const third = await saveConfirmed({
      tag: assignments[0].tagNumber,
      assignment: assignments[0],
      observed: '288',
      existingRecord: existingSwapRecord,
      keepExistingCurrent: true
    });
    const fourth = await saveConfirmed({ tag: assignments[2].tagNumber, assignment: assignments[2], observed: '717' });
    const conflict = await detectReciprocalSwap(fourth);

    expect(conflict?.kind).toBe('conflict');
    const conflictRecords = await db.auditRecords.where('auditId').equals(AUDIT_ID).and((record) => record.status === 'audit_conflict').toArray();
    const priorSwapRecords = await db.auditRecords.where('auditId').equals(AUDIT_ID).and((record) => record.status === 'possible_swap').toArray();
    expect(third.status).toBe('reassignment');
    expect(conflictRecords).toHaveLength(2);
    expect(priorSwapRecords.length).toBeGreaterThanOrEqual(2);
    expect(conflictRecords[0].note).toContain('ja participa de uma troca confirmada');
  });

  it('D. classifies a real uncatalogued SmartTag as new_tag/register_new_tag', async () => {
    await seedAudit([{ tag: '984000010514961', animal: '717' }]);
    const status = await classifyReading(AUDIT_ID, '984000099999999', null, '4454');
    const record = await saveConfirmed({ tag: '984000099999999', assignment: null, observed: '4454', status });
    const effective = await db.effectiveTagAssignments.where('[auditId+tagNumber]').equals([AUDIT_ID, '984000099999999']).first();

    expect(status).toBe('new_tag');
    expect(record.operationalAction).toBe('register_new_tag');
    expect(effective?.status).toBe('new_tag');
  });

  it('E. links a tag without Nedap animal to the observed animal', async () => {
    const { assignments } = await seedAudit([{ tag: '984000010514964', animal: null }]);
    const status = await classifyReading(AUDIT_ID, assignments[0].tagNumber, assignments[0], '4110');
    const record = await saveConfirmed({ tag: assignments[0].tagNumber, assignment: assignments[0], observed: '4110', status });
    const effective = await db.effectiveTagAssignments.where('[auditId+tagNumber]').equals([AUDIT_ID, assignments[0].tagNumber]).first();

    expect(status).toBe('linked');
    expect(record.operationalAction).toBe('link_tag');
    expect(effective?.status).toBe('linked');
    expect(effective?.effectiveAnimal).toBe('4110');
  });

  it('F. preserves effective state when a reading is not confirmed', async () => {
    const { assignments } = await seedAudit([{ tag: '984000010514961', animal: '717' }]);
    await saveConfirmed({ tag: assignments[0].tagNumber, assignment: assignments[0], observed: '717', status: 'correct' });
    const before = await db.effectiveTagAssignments.where('[auditId+tagNumber]').equals([AUDIT_ID, assignments[0].tagNumber]).first();

    await saveReading({
      auditId: AUDIT_ID,
      tagNumber: assignments[0].tagNumber,
      assignment: assignments[0],
      expectedAnimal: assignments[0].expectedAnimal,
      observedAnimal: '9999',
      status: 'unconfirmed',
      fieldDecision: 'could_not_confirm',
      source: 'manual',
      existingRecord: null
    });
    const after = await db.effectiveTagAssignments.where('[auditId+tagNumber]').equals([AUDIT_ID, assignments[0].tagNumber]).first();
    const unconfirmed = await db.auditRecords.where('auditId').equals(AUDIT_ID).and((record) => record.status === 'unconfirmed').first();

    expect(after?.effectiveAnimal).toBe(before?.effectiveAnimal);
    expect(after?.currentRecordId).toBe(before?.currentRecordId);
    expect(unconfirmed?.isCurrent).toBe(false);
  });

  it('G. detects a likely registry typo without silently replacing physical evidence', async () => {
    await seedAudit([{ tag: '904000010514965', animal: '3333', validationStatus: 'suspicious_tag' }]);
    const status = await classifyReading(AUDIT_ID, '984000010514965', null, '3333');
    const record = await saveConfirmed({ tag: '984000010514965', assignment: null, observed: '3333', status });

    expect(status).toBe('possible_typo');
    expect(record.tagNumber).toBe('984000010514965');
    expect(record.operationalAction).toBe('investigate');
  });

  it('H. creates a correction as a new event and keeps the previous evidence in history', async () => {
    const { assignments } = await seedAudit([{ tag: '984000010514961', animal: '717' }]);
    const original = await saveConfirmed({ tag: assignments[0].tagNumber, assignment: assignments[0], observed: '907' });
    const corrected = await correctConfirmedReading({ auditId: AUDIT_ID, originalRecord: original, assignment: assignments[0], observedAnimal: '717' });
    const records = await db.auditRecords.where('auditId').equals(AUDIT_ID).toArray();

    expect(corrected?.status).toBe('correct');
    expect(corrected?.supersedesRecordId).toBe(original.id);
    expect(records).toHaveLength(2);
    expect(records.find((record) => record.id === original.id)?.isCurrent).toBe(false);
  });

  it('I. keeps full chronological evidence with sequence numbers', async () => {
    const { assignments } = await seedAudit([{ tag: '984000010514961', animal: '717' }]);
    await saveConfirmed({ tag: assignments[0].tagNumber, assignment: assignments[0], observed: '717', status: 'correct' });
    await saveReading({
      auditId: AUDIT_ID,
      tagNumber: assignments[0].tagNumber,
      assignment: assignments[0],
      expectedAnimal: assignments[0].expectedAnimal,
      observedAnimal: null,
      status: 'unconfirmed',
      fieldDecision: 'could_not_confirm',
      source: 'manual',
      existingRecord: null
    });
    const records = await db.auditRecords.where('auditId').equals(AUDIT_ID).sortBy('sequence');

    expect(records.map((record) => record.sequence)).toEqual([1, 2]);
    expect(records.map((record) => record.status)).toEqual(['correct', 'unconfirmed']);
  });

  it('J. treats a movement as MOVER TAG, not as a pending swap', async () => {
    const { assignments } = await seedAudit([
      { tag: '984000010514961', animal: '4199' },
      { tag: '984000010514962', animal: '4298' }
    ]);
    const record = await saveConfirmed({ tag: assignments[0].tagNumber, assignment: assignments[0], observed: '4298' });
    const swap = await detectReciprocalSwap(record);

    expect(swap).toBeNull();
    expect(record.status).toBe('reassignment');
    expect(record.operationalAction).toBe('move_tag');
  });
});
