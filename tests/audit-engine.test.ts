import 'fake-indexeddb/auto';

import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/db/db';
import type { Audit, AuditRecord, EffectiveTagAssignment, TagAssignment, TagValidationStatus } from '../src/types/domain';
import {
  classifyReading,
  correctConfirmedReading,
  detectReciprocalSwap,
  markPendingTagsNotFound,
  saveReading
} from '../src/services/audit-engine';
import { deriveReconciliation } from '../src/services/reconciliation';
import { buildAuditReportRows, createAuditWorkbook } from '../src/services/excel';

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
    existingRecord: input.existingRecord ?? null
  });
}

async function saveTagWithoutAnimal(input: {
  tag: string;
  assignment: TagAssignment | null;
  existingRecord?: AuditRecord | null;
}) {
  return saveReading({
    auditId: AUDIT_ID,
    tagNumber: input.tag,
    assignment: input.assignment,
    expectedAnimal: input.assignment?.expectedAnimal ?? null,
    observedAnimal: null,
    status: 'tag_stored',
    fieldDecision: 'tag_without_animal',
    source: 'manual',
    existingRecord: input.existingRecord ?? null,
    operationalAction: input.assignment?.expectedAnimal ? 'remove_tag' : null,
    actionNote: input.assignment?.expectedAnimal
      ? 'Tag guardada sem animal.'
      : 'Tag ja estava sem animal.'
  });
}

async function saveAnimalWithoutEarTag(input: {
  tag: string;
  assignment: TagAssignment | null;
  existingRecord?: AuditRecord | null;
}) {
  return saveReading({
    auditId: AUDIT_ID,
    tagNumber: input.tag,
    assignment: input.assignment,
    expectedAnimal: input.assignment?.expectedAnimal ?? null,
    observedAnimal: null,
    status: 'animal_without_ear_tag',
    fieldDecision: 'animal_without_ear_tag',
    source: 'manual',
    existingRecord: input.existingRecord ?? null,
    operationalAction: null,
    note: 'Animal sem brinco visual.'
  });
}

function summaryValue(rows: (string | number)[][], label: string) {
  return rows.find((row) => row[0] === label)?.[1];
}

function finalResultRow(rows: ReturnType<typeof buildAuditReportRows>, tagNumber: string) {
  return rows.resultFinalRows.find((row) => row.smartTag === tagNumber);
}

function conferenceDecisionFor(rows: ReturnType<typeof buildAuditReportRows>, tagNumber: string) {
  return rows.conferenceRows.find((row) => row[2] === tagNumber)?.[7];
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

  it('C. lets later confirmed evidence replace an older swap without creating audit conflict', async () => {
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
      existingRecord: existingSwapRecord
    });
    const fourth = await saveConfirmed({ tag: assignments[2].tagNumber, assignment: assignments[2], observed: '717' });
    const swap = await detectReciprocalSwap(fourth);

    const records = await db.auditRecords.where('auditId').equals(AUDIT_ID).toArray();
    const reconciliation = deriveReconciliation(assignments, records);
    const conflictRecords = records.filter((record) => record.status === 'audit_conflict' || record.status === 'new_tag_conflict');
    const effective961 = await db.effectiveTagAssignments.where('[auditId+tagNumber]').equals([AUDIT_ID, assignments[0].tagNumber]).first();

    expect(third.status).toBe('reassignment');
    expect(swap?.kind).toBe('swap');
    expect(conflictRecords).toHaveLength(0);
    expect(reconciliation.swapPairs).toHaveLength(1);
    expect(reconciliation.swapPairs[0].left.originalAnimal).toBe('717');
    expect(reconciliation.swapPairs[0].left.finalAnimal).toBe('288');
    expect(effective961?.effectiveAnimal).toBe('288');
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

  it('G. detects a likely registry typo while keeping the physical tag as final evidence', async () => {
    await seedAudit([{ tag: '904000010514965', animal: '3333', validationStatus: 'suspicious_tag' }]);
    const status = await classifyReading(AUDIT_ID, '984000010514965', null, '3333');
    const record = await saveConfirmed({ tag: '984000010514965', assignment: null, observed: '3333', status });

    expect(status).toBe('possible_typo');
    expect(record.tagNumber).toBe('984000010514965');
    expect(record.operationalAction).toBe('register_new_tag');
  });

  it('H. creates a correction as a new event and keeps the previous evidence in history', async () => {
    const { assignments } = await seedAudit([{ tag: '984000010514961', animal: '717' }]);
    const original = await saveConfirmed({ tag: assignments[0].tagNumber, assignment: assignments[0], observed: '907' });
    const corrected = await correctConfirmedReading({ auditId: AUDIT_ID, originalRecord: original, assignment: assignments[0], observedAnimal: '288' });
    const records = await db.auditRecords.where('auditId').equals(AUDIT_ID).toArray();
    const effective = await db.effectiveTagAssignments.where('[auditId+tagNumber]').equals([AUDIT_ID, assignments[0].tagNumber]).first();

    expect(corrected?.status).toBe('reassignment');
    expect(corrected?.supersedesRecordId).toBe(original.id);
    expect(records).toHaveLength(2);
    expect(records.find((record) => record.id === original.id)?.isCurrent).toBe(false);
    expect(effective?.effectiveAnimal).toBe('288');
    expect(records.map((record) => record.observedAnimal).sort()).toEqual(['288', '907']);
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

  it('K. resolves a three-tag chain from final confirmed evidence without false animal gaps', async () => {
    const { assignments } = await seedAudit([
      { tag: '984000010514961', animal: '717' },
      { tag: '984000010514962', animal: '907' },
      { tag: '984000010514963', animal: '288' }
    ]);

    await saveConfirmed({ tag: assignments[0].tagNumber, assignment: assignments[0], observed: '907' });
    await saveConfirmed({ tag: assignments[1].tagNumber, assignment: assignments[1], observed: '288' });
    await saveConfirmed({ tag: assignments[2].tagNumber, assignment: assignments[2], observed: '717' });

    const records = await db.auditRecords.where('auditId').equals(AUDIT_ID).toArray();
    const reconciliation = deriveReconciliation(assignments, records);

    expect(reconciliation.swapPairs).toHaveLength(0);
    expect(reconciliation.animalsWithoutConfirmedTag).toHaveLength(0);
    expect(reconciliation.stateByTag.get(assignments[0].tagNumber)?.finalAnimal).toBe('907');
    expect(reconciliation.stateByTag.get(assignments[1].tagNumber)?.finalAnimal).toBe('288');
    expect(reconciliation.stateByTag.get(assignments[2].tagNumber)?.finalAnimal).toBe('717');
  });

  it('L. uses the latest confirmed evidence when the same new tag is read in another animal', async () => {
    await seedAudit([{ tag: '984000010514961', animal: '717' }]);

    const first = await saveConfirmed({
      tag: '984000099999999',
      assignment: null,
      observed: '4454',
      status: 'new_tag'
    });
    const second = await saveConfirmed({
      tag: '984000099999999',
      assignment: null,
      observed: '288',
      status: 'new_tag',
      existingRecord: first
    });

    const records = await db.auditRecords.where('auditId').equals(AUDIT_ID).toArray();
    const effective = await db.effectiveTagAssignments.where('[auditId+tagNumber]').equals([AUDIT_ID, '984000099999999']).first();
    const reconciliation = deriveReconciliation([], records);

    expect(records).toHaveLength(2);
    expect(records.find((record) => record.id === first.id)?.isCurrent).toBe(false);
    expect(second.isCurrent).toBe(true);
    expect(records.filter((record) => record.status === 'audit_conflict' || record.status === 'new_tag_conflict')).toHaveLength(0);
    expect(effective?.effectiveAnimal).toBe('288');
    expect(reconciliation.stateByTag.get('984000099999999')?.finalAnimal).toBe('288');
  });

  it('M. reports no Nedap correction when the tag is correct', async () => {
    const { audit, assignments } = await seedAudit([{ tag: '984000010514961', animal: '1001' }]);
    await saveConfirmed({ tag: assignments[0].tagNumber, assignment: assignments[0], observed: '1001', status: 'correct' });

    const records = await db.auditRecords.where('auditId').equals(AUDIT_ID).toArray();
    const effective = await db.effectiveTagAssignments.where('auditId').equals(AUDIT_ID).toArray();
    const rows = buildAuditReportRows(audit, records, [], effective, [], assignments);

    expect(rows.actionRows).toHaveLength(1);
    expect(effective[0].status).toBe('confirmed');
  });

  it('N. keeps only the final animal gap when the old animal receives another tag', async () => {
    const { audit, assignments } = await seedAudit([
      { tag: '984000010514961', animal: '1001' },
      { tag: '984000010514962', animal: '1002' }
    ]);

    await saveConfirmed({ tag: assignments[0].tagNumber, assignment: assignments[0], observed: '2001' });
    await saveConfirmed({ tag: assignments[1].tagNumber, assignment: assignments[1], observed: '1001' });

    const records = await db.auditRecords.where('auditId').equals(AUDIT_ID).toArray();
    const effective = await db.effectiveTagAssignments.where('auditId').equals(AUDIT_ID).toArray();
    const reconciliation = deriveReconciliation(assignments, records);
    const rows = buildAuditReportRows(audit, records, [], effective, [], assignments);

    expect(reconciliation.stateByTag.get(assignments[0].tagNumber)?.finalAnimal).toBe('2001');
    expect(reconciliation.stateByTag.get(assignments[1].tagNumber)?.finalAnimal).toBe('1001');
    expect(reconciliation.animalsWithoutConfirmedTag.map((gap) => gap.animal)).toEqual(['1002']);
    expect(rows.animalGapRows).toContainEqual(expect.arrayContaining(['1002', assignments[1].tagNumber]));
    expect(rows.animalGapRows.slice(1).map((row) => row[0])).not.toContain('1001');
  });

  it('O. stores a tag without animal and suggests removing the Nedap link', async () => {
    const { audit, assignments } = await seedAudit([{ tag: '984000010514961', animal: '1001' }]);

    await saveTagWithoutAnimal({ tag: assignments[0].tagNumber, assignment: assignments[0] });

    const records = await db.auditRecords.where('auditId').equals(AUDIT_ID).toArray();
    const effective = await db.effectiveTagAssignments.where('auditId').equals(AUDIT_ID).toArray();
    const rows = buildAuditReportRows(audit, records, [], effective, [], assignments);

    expect(effective[0].status).toBe('without_animal');
    expect(effective[0].effectiveAnimal).toBeNull();
    expect(rows.actionRows).toContainEqual(expect.arrayContaining(['REMOVER VINCULO', assignments[0].tagNumber, '1001', 'SEM ANIMAL']));
  });

  it('P. records a stored tag that was already without animal without Nedap action', async () => {
    const { audit, assignments } = await seedAudit([{ tag: '984000010514961', animal: null }]);

    await saveTagWithoutAnimal({ tag: assignments[0].tagNumber, assignment: assignments[0] });

    const records = await db.auditRecords.where('auditId').equals(AUDIT_ID).toArray();
    const effective = await db.effectiveTagAssignments.where('auditId').equals(AUDIT_ID).toArray();
    const rows = buildAuditReportRows(audit, records, [], effective, [], assignments);

    expect(effective[0].status).toBe('without_animal');
    expect(rows.actionRows).toHaveLength(1);
  });

  it('Q. records animal without ear tag without inventing a movement', async () => {
    const { audit, assignments } = await seedAudit([{ tag: '984000010514961', animal: '1001' }]);

    await saveAnimalWithoutEarTag({ tag: assignments[0].tagNumber, assignment: assignments[0] });

    const records = await db.auditRecords.where('auditId').equals(AUDIT_ID).toArray();
    const effective = await db.effectiveTagAssignments.where('auditId').equals(AUDIT_ID).toArray();
    const rows = buildAuditReportRows(audit, records, [], effective, [], assignments);

    expect(records[0].observedAnimal).toBeNull();
    expect(records[0].operationalAction).toBeNull();
    expect(effective[0].status).toBe('unresolved');
    expect(effective[0].effectiveAnimal).toBe('1001');
    expect(rows.actionRows).toHaveLength(1);
    expect(rows.reviewRows).toContainEqual(expect.arrayContaining(['ANIMAL SEM BRINCO', assignments[0].tagNumber]));
  });

  it('R. keeps known alerts separate from the physical final state', async () => {
    const { audit, assignments } = await seedAudit([{ tag: '984000010514961', animal: '1001' }]);
    const now = new Date().toISOString();
    await db.knownIssues.add({
      id: 'known-1',
      auditId: AUDIT_ID,
      tagNumber: assignments[0].tagNumber,
      type: 'stopped_sending',
      note: 'Parou de enviar antes da ordenha.',
      createdAt: now,
      updatedAt: now,
      syncStatus: 'pending'
    });

    await saveConfirmed({ tag: assignments[0].tagNumber, assignment: assignments[0], observed: '2001' });

    const records = await db.auditRecords.where('auditId').equals(AUDIT_ID).toArray();
    const knownIssues = await db.knownIssues.where('auditId').equals(AUDIT_ID).toArray();
    const effective = await db.effectiveTagAssignments.where('auditId').equals(AUDIT_ID).toArray();
    const rows = buildAuditReportRows(audit, records, [], effective, knownIssues, assignments);

    expect(effective[0].effectiveAnimal).toBe('2001');
    expect(rows.actionRows).toContainEqual(expect.arrayContaining(['MOVER TAG', assignments[0].tagNumber, '1001', '2001']));
    expect(rows.reviewRows).toContainEqual(expect.arrayContaining(['PROBLEMA CONHECIDO', assignments[0].tagNumber]));
  });

  it('S. marks not located tags only when pending tags are finalized as missing', async () => {
    const { audit, assignments } = await seedAudit([
      { tag: '984000010514961', animal: '1001' },
      { tag: '984000010514962', animal: '1002' },
      { tag: '984000010514963', animal: '1003' }
    ]);
    await saveConfirmed({ tag: assignments[0].tagNumber, assignment: assignments[0], observed: '1001', status: 'correct' });
    await saveConfirmed({ tag: assignments[1].tagNumber, assignment: assignments[1], observed: '1002', status: 'correct' });

    let effective = await db.effectiveTagAssignments.where('auditId').equals(AUDIT_ID).toArray();
    expect(effective.find((item) => item.tagNumber === assignments[2].tagNumber)?.status).toBe('pending');

    await markPendingTagsNotFound(AUDIT_ID);
    const records = await db.auditRecords.where('auditId').equals(AUDIT_ID).toArray();
    effective = await db.effectiveTagAssignments.where('auditId').equals(AUDIT_ID).toArray();
    const rows = buildAuditReportRows(audit, records, [], effective, [], assignments);

    expect(effective.find((item) => item.tagNumber === assignments[2].tagNumber)?.status).toBe('not_found');
    expect(rows.reviewRows).toContainEqual(expect.arrayContaining(['TAG NAO LOCALIZADA', assignments[2].tagNumber]));
  });

  it('T. derives the Nedap report only from the final confirmed state', async () => {
    const { audit, assignments } = await seedAudit([{ tag: '984000010514961', animal: '1001' }]);
    const first = await saveConfirmed({ tag: assignments[0].tagNumber, assignment: assignments[0], observed: '2001' });
    await saveConfirmed({ tag: assignments[0].tagNumber, assignment: assignments[0], observed: '3001', existingRecord: first });

    const records = await db.auditRecords.where('auditId').equals(AUDIT_ID).toArray();
    const effective = await db.effectiveTagAssignments.where('auditId').equals(AUDIT_ID).toArray();
    const rows = buildAuditReportRows(audit, records, [], effective, [], assignments);

    expect(records).toHaveLength(2);
    expect(effective[0].effectiveAnimal).toBe('3001');
    expect(rows.conferenceRows).toHaveLength(3);
    expect(rows.actionRows).toContainEqual(expect.arrayContaining(['MOVER TAG', assignments[0].tagNumber, '1001', '3001']));
    expect(rows.actionRows.flat().join(' ')).not.toContain('2001');
  });

  it('U. preserves all three readings in history while final state uses only the latest', async () => {
    const { assignments } = await seedAudit([{ tag: '984000010514961', animal: '1001' }]);
    const first = await saveConfirmed({ tag: assignments[0].tagNumber, assignment: assignments[0], observed: '2001' });
    const second = await saveConfirmed({ tag: assignments[0].tagNumber, assignment: assignments[0], observed: '2002', existingRecord: first });
    await saveConfirmed({ tag: assignments[0].tagNumber, assignment: assignments[0], observed: '2003', existingRecord: second });

    const records = await db.auditRecords.where('auditId').equals(AUDIT_ID).sortBy('sequence');
    const effective = await db.effectiveTagAssignments.where('[auditId+tagNumber]').equals([AUDIT_ID, assignments[0].tagNumber]).first();

    expect(records.map((record) => record.observedAnimal)).toEqual(['2001', '2002', '2003']);
    expect(effective?.effectiveAnimal).toBe('2003');
  });

  it('V. TESTE A: stored tag wins after an intermediate movement and report removes original Nedap link', async () => {
    const { audit, assignments } = await seedAudit([{ tag: '984000010514961', animal: '1001' }]);

    const movement = await saveConfirmed({ tag: assignments[0].tagNumber, assignment: assignments[0], observed: '2001' });
    await saveTagWithoutAnimal({ tag: assignments[0].tagNumber, assignment: assignments[0], existingRecord: movement });

    const records = await db.auditRecords.where('auditId').equals(AUDIT_ID).sortBy('sequence');
    const effective = await db.effectiveTagAssignments.where('[auditId+tagNumber]').equals([AUDIT_ID, assignments[0].tagNumber]).first();
    const rows = buildAuditReportRows(audit, records, [], effective ? [effective] : [], [], assignments);
    const removeAction = rows.actionRows.find((row) => String(row[0]).startsWith('REMOVER'));

    expect(records.map((record) => record.observedAnimal)).toEqual(['2001', null]);
    expect(effective?.status).toBe('without_animal');
    expect(effective?.effectiveAnimal).toBeNull();
    expect(removeAction).toEqual(expect.arrayContaining([assignments[0].tagNumber, '1001', 'SEM ANIMAL']));
    expect(rows.actionRows.flat().join(' ')).not.toContain('2001');
    expect(rows.conferenceRows.flat().join(' ')).toContain('2001');
  });

  it('W. TESTE B: latest confirmed animal wins after a tag was stored without animal', async () => {
    const { audit, assignments } = await seedAudit([{ tag: '984000010514961', animal: '1001' }]);

    const stored = await saveTagWithoutAnimal({ tag: assignments[0].tagNumber, assignment: assignments[0] });
    await saveConfirmed({ tag: assignments[0].tagNumber, assignment: assignments[0], observed: '3001', existingRecord: stored });

    const records = await db.auditRecords.where('auditId').equals(AUDIT_ID).sortBy('sequence');
    const effective = await db.effectiveTagAssignments.where('[auditId+tagNumber]').equals([AUDIT_ID, assignments[0].tagNumber]).first();
    const rows = buildAuditReportRows(audit, records, [], effective ? [effective] : [], [], assignments);

    expect(records.map((record) => record.observedAnimal)).toEqual([null, '3001']);
    expect(effective?.effectiveAnimal).toBe('3001');
    expect(rows.actionRows).toContainEqual(expect.arrayContaining(['MOVER TAG', assignments[0].tagNumber, '1001', '3001']));
    expect(rows.actionRows.find((row) => String(row[0]).startsWith('REMOVER'))).toBeUndefined();
  });

  it('X. TESTE C: animal without ear tag does not erase the last confirmed physical link', async () => {
    const { audit, assignments } = await seedAudit([{ tag: '984000010514961', animal: '1001' }]);

    const physicalLink = await saveConfirmed({ tag: assignments[0].tagNumber, assignment: assignments[0], observed: '3001' });
    await saveAnimalWithoutEarTag({ tag: assignments[0].tagNumber, assignment: assignments[0], existingRecord: physicalLink });

    const records = await db.auditRecords.where('auditId').equals(AUDIT_ID).sortBy('sequence');
    const effective = await db.effectiveTagAssignments.where('[auditId+tagNumber]').equals([AUDIT_ID, assignments[0].tagNumber]).first();
    const rows = buildAuditReportRows(audit, records, [], effective ? [effective] : [], [], assignments);

    expect(records.map((record) => record.status)).toEqual(['animal_not_in_base', 'animal_without_ear_tag']);
    expect(records[1].observedAnimal).toBeNull();
    expect(records[1].operationalAction).toBeNull();
    expect(effective?.effectiveAnimal).toBe('3001');
    expect(rows.reviewRows).toContainEqual(expect.arrayContaining(['ANIMAL SEM BRINCO', assignments[0].tagNumber]));
  });

  it('Report 1. new field tags do not increase base coverage', async () => {
    const base = Array.from({ length: 9 }, (_, index) => ({
      tag: `98400001235000${index + 1}`,
      animal: `600${index + 1}`
    }));
    const { audit, assignments } = await seedAudit(base);

    for (const assignment of assignments.slice(0, 8)) {
      await saveConfirmed({ tag: assignment.tagNumber, assignment, observed: assignment.expectedAnimal, status: 'correct' });
    }
    await saveConfirmed({ tag: '984000099999999', assignment: null, observed: '6018', status: 'new_tag' });

    const records = await db.auditRecords.where('auditId').equals(AUDIT_ID).toArray();
    const effective = await db.effectiveTagAssignments.where('auditId').equals(AUDIT_ID).toArray();
    const rows = buildAuditReportRows(audit, records, [], effective, [], assignments);

    expect(rows.metrics.totalValid).toBe(9);
    expect(rows.metrics.baseResolvedCount).toBe(8);
    expect(rows.metrics.newTagsCount).toBe(1);
    expect(summaryValue(rows.resultRows, 'Tags da base com resultado')).toBe(8);
    expect(summaryValue(rows.resultRows, 'Tags novas encontradas')).toBe(1);
  });

  it('Report 2. final confirmed state does not remain as a generic pending item', async () => {
    const { audit, assignments } = await seedAudit([{ tag: '984000012350004', animal: '6004' }]);

    const first = await saveConfirmed({ tag: assignments[0].tagNumber, assignment: assignments[0], observed: '6104' });
    await saveConfirmed({ tag: assignments[0].tagNumber, assignment: assignments[0], observed: '6204', existingRecord: first });

    const records = await db.auditRecords.where('auditId').equals(AUDIT_ID).toArray();
    const effective = await db.effectiveTagAssignments.where('auditId').equals(AUDIT_ID).toArray();
    const rows = buildAuditReportRows(audit, records, [], effective, [], assignments);
    const tagReviewRows = rows.reviewRows.filter((row) => row[1] === assignments[0].tagNumber);

    expect(rows.actionRows).toContainEqual(expect.arrayContaining(['MOVER TAG', assignments[0].tagNumber, '6004', '6204']));
    expect(rows.actionRows.flat().join(' ')).not.toContain('6104');
    expect(tagReviewRows.map((row) => row[0])).not.toContain('PENDENCIA');
  });

  it('Report 3. animal without ear tag appears once and not as generic pending', async () => {
    const { audit, assignments } = await seedAudit([{ tag: '984000012350006', animal: '6006' }]);

    await saveAnimalWithoutEarTag({ tag: assignments[0].tagNumber, assignment: assignments[0] });

    const records = await db.auditRecords.where('auditId').equals(AUDIT_ID).toArray();
    const effective = await db.effectiveTagAssignments.where('auditId').equals(AUDIT_ID).toArray();
    const rows = buildAuditReportRows(audit, records, [], effective, [], assignments);
    const tagRows = rows.reviewRows.filter((row) => row[1] === assignments[0].tagNumber);

    expect(tagRows.filter((row) => row[0] === 'ANIMAL SEM BRINCO')).toHaveLength(1);
    expect(tagRows.map((row) => row[0])).not.toContain('PENDENCIA');
  });

  it('Report 4. known issue does not automatically become INVESTIGAR when physical state is resolved', async () => {
    const { audit, assignments } = await seedAudit([{ tag: '984000012350010', animal: '6010' }]);
    const timestamp = now();
    await db.knownIssues.add({
      id: 'known-report-1',
      auditId: AUDIT_ID,
      tagNumber: assignments[0].tagNumber,
      type: 'stopped_sending',
      note: 'Parou de enviar dados.',
      createdAt: timestamp,
      updatedAt: timestamp,
      syncStatus: 'pending'
    });
    await saveConfirmed({ tag: assignments[0].tagNumber, assignment: assignments[0], observed: '6010', status: 'correct' });

    const records = await db.auditRecords.where('auditId').equals(AUDIT_ID).toArray();
    const effective = await db.effectiveTagAssignments.where('auditId').equals(AUDIT_ID).toArray();
    const knownIssues = await db.knownIssues.where('auditId').equals(AUDIT_ID).toArray();
    const rows = buildAuditReportRows(audit, records, [], effective, knownIssues, assignments);
    const knownIssueRow = rows.reviewRows.find((row) => row[0] === 'PROBLEMA CONHECIDO');

    expect(knownIssueRow?.[4]).not.toBe('INVESTIGAR');
    expect(finalResultRow(rows, assignments[0].tagNumber)?.acaoNoNedap).toBe('NENHUMA');
  });

  it('Report 5. confirmed animal outside imported base still generates a definitive move', async () => {
    const { audit, assignments } = await seedAudit([{ tag: '984000012350004', animal: '6004' }]);

    await saveConfirmed({ tag: assignments[0].tagNumber, assignment: assignments[0], observed: '6204' });

    const records = await db.auditRecords.where('auditId').equals(AUDIT_ID).toArray();
    const effective = await db.effectiveTagAssignments.where('auditId').equals(AUDIT_ID).toArray();
    const rows = buildAuditReportRows(audit, records, [], effective, [], assignments);
    const alertRow = rows.reviewRows.find((row) => row[0] === 'ANIMAL FORA DA BASE');

    expect(rows.actionRows).toContainEqual(expect.arrayContaining(['MOVER TAG', assignments[0].tagNumber, '6004', '6204']));
    expect(alertRow?.[4]).toBe('ALERTA INFORMATIVO');
    expect(rows.reviewRows.filter((row) => row[1] === assignments[0].tagNumber).map((row) => row[0])).not.toContain('PENDENCIA');
  });

  it('Report 6. confirmed new tag receives CADASTRAR TAG decision in history', async () => {
    const { audit, assignments } = await seedAudit([{ tag: '984000012350001', animal: '6001' }]);

    await saveConfirmed({ tag: '984000099999999', assignment: null, observed: '6018', status: 'new_tag' });

    const records = await db.auditRecords.where('auditId').equals(AUDIT_ID).toArray();
    const effective = await db.effectiveTagAssignments.where('auditId').equals(AUDIT_ID).toArray();
    const rows = buildAuditReportRows(audit, records, [], effective, [], assignments);

    expect(conferenceDecisionFor(rows, '984000099999999')).toBe('CADASTRAR TAG');
  });

  it('Report 7. not located tag receives TAG NAO LOCALIZADA decision in history', async () => {
    const { audit, assignments } = await seedAudit([{ tag: '984000012350009', animal: '6009' }]);

    await markPendingTagsNotFound(AUDIT_ID);

    const records = await db.auditRecords.where('auditId').equals(AUDIT_ID).toArray();
    const effective = await db.effectiveTagAssignments.where('auditId').equals(AUDIT_ID).toArray();
    const rows = buildAuditReportRows(audit, records, [], effective, [], assignments);

    expect(conferenceDecisionFor(rows, assignments[0].tagNumber)).toBe('TAG NAO LOCALIZADA');
  });

  it('Report 8. final result includes correct tags', async () => {
    const { audit, assignments } = await seedAudit([{ tag: '984000012350001', animal: '6001' }]);

    await saveConfirmed({ tag: assignments[0].tagNumber, assignment: assignments[0], observed: '6001', status: 'correct' });

    const records = await db.auditRecords.where('auditId').equals(AUDIT_ID).toArray();
    const effective = await db.effectiveTagAssignments.where('auditId').equals(AUDIT_ID).toArray();
    const rows = buildAuditReportRows(audit, records, [], effective, [], assignments);

    expect(finalResultRow(rows, assignments[0].tagNumber)?.status).toBe('CORRETA');
    expect(finalResultRow(rows, assignments[0].tagNumber)?.acaoNoNedap).toBe('NENHUMA');
  });

  it('Report 9. final result includes new tags found in field', async () => {
    const { audit, assignments } = await seedAudit([{ tag: '984000012350001', animal: '6001' }]);

    await saveConfirmed({ tag: '984000099999999', assignment: null, observed: '6018', status: 'new_tag' });

    const records = await db.auditRecords.where('auditId').equals(AUDIT_ID).toArray();
    const effective = await db.effectiveTagAssignments.where('auditId').equals(AUDIT_ID).toArray();
    const rows = buildAuditReportRows(audit, records, [], effective, [], assignments);

    expect(finalResultRow(rows, '984000099999999')?.status).toBe('NOVA');
    expect(finalResultRow(rows, '984000099999999')?.acaoNoNedap).toBe('CADASTRAR -> 6018');
  });

  it('Report 10. final result does not duplicate SmartTags', async () => {
    const { audit, assignments } = await seedAudit([{ tag: '984000012350004', animal: '6004' }]);

    const first = await saveConfirmed({ tag: assignments[0].tagNumber, assignment: assignments[0], observed: '6104' });
    await saveConfirmed({ tag: assignments[0].tagNumber, assignment: assignments[0], observed: '6204', existingRecord: first });

    const records = await db.auditRecords.where('auditId').equals(AUDIT_ID).toArray();
    const effective = await db.effectiveTagAssignments.where('auditId').equals(AUDIT_ID).toArray();
    const rows = buildAuditReportRows(audit, records, [], effective, [], assignments);
    const smartTags = rows.resultFinalRows.map((row) => row.smartTag);

    expect(smartTags).toHaveLength(new Set(smartTags).size);
  });

  it('Report 11. SmartTag cells are exported as text', async () => {
    const { audit, assignments } = await seedAudit([{ tag: '984000012350001', animal: '6001' }]);

    await saveConfirmed({ tag: assignments[0].tagNumber, assignment: assignments[0], observed: '6001', status: 'correct' });

    const records = await db.auditRecords.where('auditId').equals(AUDIT_ID).toArray();
    const effective = await db.effectiveTagAssignments.where('auditId').equals(AUDIT_ID).toArray();
    const workbook = createAuditWorkbook(audit, records, [], effective, [], assignments);
    const sheet = workbook.Sheets['RESULTADO FINAL'];
    const smartTagCell = Object.values(sheet).find((cell) => typeof cell === 'object' && 'v' in cell && cell.v === assignments[0].tagNumber);

    expect(smartTagCell?.t).toBe('s');
    expect(smartTagCell?.z).toBe('@');
  });

  it('Report 12. Corrigir no Nedap contains only the final state', async () => {
    const { audit, assignments } = await seedAudit([{ tag: '984000012350004', animal: '6004' }]);

    const first = await saveConfirmed({ tag: assignments[0].tagNumber, assignment: assignments[0], observed: '6104' });
    await saveConfirmed({ tag: assignments[0].tagNumber, assignment: assignments[0], observed: '6204', existingRecord: first });

    const records = await db.auditRecords.where('auditId').equals(AUDIT_ID).toArray();
    const effective = await db.effectiveTagAssignments.where('auditId').equals(AUDIT_ID).toArray();
    const rows = buildAuditReportRows(audit, records, [], effective, [], assignments);

    expect(rows.actionRows).toContainEqual(expect.arrayContaining(['MOVER TAG', assignments[0].tagNumber, '6004', '6204']));
    expect(rows.actionRows.flat().join(' ')).not.toContain('6104');
    expect(rows.actionRows.map((row) => row[0])).not.toContain('MANTER TAG');
  });
});
