import { db, newId } from '../db/db';
import type { AuditRecord, RecordStatus, TagAssignment } from '../types/domain';

export type RelatedContext = {
  records: AuditRecord[];
  message: string | null;
};

function recordOrder(record: AuditRecord) {
  return record.sequence ?? Number.MAX_SAFE_INTEGER;
}

export async function getCurrentRecord(auditId: string, tagNumber: string) {
  const records = await db.auditRecords.where('[auditId+tagNumber]').equals([auditId, tagNumber]).toArray();
  return records
    .filter((record) => record.isCurrent)
    .sort((a, b) => recordOrder(b) - recordOrder(a) || b.scannedAt.localeCompare(a.scannedAt))[0] ?? null;
}

export async function getRelatedContext(auditId: string, assignment: TagAssignment | null): Promise<RelatedContext> {
  if (!assignment?.expectedAnimal) return { records: [], message: null };

  const current = (await db.auditRecords.where('auditId').equals(auditId).toArray()).filter(
    (record) => record.isCurrent && record.status !== 'correct' && record.status !== 'unconfirmed'
  );

  const related = current.filter(
    (record) =>
      record.expectedAnimal === assignment.expectedAnimal ||
      record.observedAnimal === assignment.expectedAnimal
  );

  if (!related.length) return { records: [], message: null };

  const latest = [...related].sort((a, b) => recordOrder(b) - recordOrder(a) || b.scannedAt.localeCompare(a.scannedAt))[0];
  return {
    records: related,
    message: latest
      ? `Este animal ja possui uma ocorrencia relacionada nesta auditoria. Tag ${latest.tagNumber}; ${latest.expectedAnimal ?? 'sem cadastro'} -> ${latest.observedAnimal ?? 'nao confirmado'}; ${latest.status}.`
      : `Este animal ja possui ${related.length} ocorrencia relacionada nesta auditoria.`
  };
}

export async function observedAnimalExists(auditId: string, animal: string | null) {
  if (!animal) return false;
  return Boolean(
    await db.tagAssignments.where('[auditId+expectedAnimal]').equals([auditId, animal]).first()
  );
}

export async function classifyReading(
  auditId: string,
  assignment: TagAssignment | null,
  observedAnimal: string | null
): Promise<RecordStatus> {
  if (!assignment) return 'tag_not_registered';
  if (!assignment.expectedAnimal) return 'tag_without_animal';
  if (assignment.expectedAnimal === observedAnimal) return 'correct';
  if (!observedAnimal) return 'unconfirmed';
  return (await observedAnimalExists(auditId, observedAnimal)) ? 'divergence' : 'animal_not_in_base';
}

async function getNextSequence(auditId: string) {
  const records = await db.auditRecords.where('auditId').equals(auditId).toArray();
  return records.reduce((max, record) => Math.max(max, record.sequence ?? 0), 0) + 1;
}

export async function saveReading(input: {
  auditId: string;
  tagNumber: string;
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

  await db.transaction('rw', db.auditRecords, db.audits, async () => {
    if (input.existingRecord?.isCurrent) {
      await db.auditRecords.update(input.existingRecord.id, { isCurrent: false, updatedAt: now, syncStatus: 'pending' });
    }

    await db.auditRecords.add({
      id,
      auditId: input.auditId,
      sequence,
      tagNumber: input.tagNumber,
      expectedAnimal: input.expectedAnimal,
      observedAnimal: input.observedAnimal,
      status: input.status,
      fieldDecision: input.fieldDecision,
      reviewStatus: input.status === 'correct' ? 'not_required' : 'open',
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
      relatedRecordId: null
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
    record.status !== 'divergence' ||
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
      (candidate.status === 'divergence' || candidate.status === 'possible_swap') &&
      candidate.expectedAnimal === record.observedAnimal &&
      candidate.observedAnimal === record.expectedAnimal &&
      candidate.fieldDecision === 'confirmed_physical_animal'
  );

  const pair = candidates.sort((a, b) => recordOrder(b) - recordOrder(a) || b.scannedAt.localeCompare(a.scannedAt))[0];
  if (!pair) return null;

  const pairId = pair.pairId ?? newId('swap');
  const now = new Date().toISOString();
  await db.transaction('rw', db.auditRecords, async () => {
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
  });

  return {
    current: (await db.auditRecords.get(record.id))!,
    other: (await db.auditRecords.get(pair.id))!
  };
}
