import Dexie, { type EntityTable } from 'dexie';
import type { Audit, AuditRecord, ImportIssue, TagAssignment } from '../types/domain';
import { generateId } from '../utils/id';

class BiptagDB extends Dexie {
  audits!: EntityTable<Audit, 'id'>;
  tagAssignments!: EntityTable<TagAssignment, 'id'>;
  auditRecords!: EntityTable<AuditRecord, 'id'>;
  importIssues!: EntityTable<ImportIssue, 'id'>;

  constructor() {
    super('biptag-db');

    this.version(1).stores({
      audits: 'id, status, createdAt, updatedAt, farmName',
      tagAssignments:
        'id, auditId, tagNumber, expectedAnimal, [auditId+tagNumber], [auditId+expectedAnimal]',
      auditRecords:
        'id, auditId, tagNumber, status, scannedAt, [auditId+tagNumber]',
      importIssues: 'id, auditId, type, tagNumber, animal'
    });

    this.version(2).stores({
      audits: 'id, status, createdAt, updatedAt, lastActivityAt, farmName',
      tagAssignments:
        'id, auditId, tagNumber, expectedAnimal, [auditId+tagNumber], [auditId+expectedAnimal]',
      auditRecords:
        'id, auditId, tagNumber, status, isCurrent, reviewStatus, scannedAt, expectedAnimal, observedAnimal, pairId, [auditId+tagNumber]',
      importIssues: 'id, auditId, type, tagNumber, animal'
    }).upgrade(async (tx) => {
      const audits = tx.table('audits');
      await audits.toCollection().modify((audit: Partial<Audit>) => {
        const fallback = audit.updatedAt ?? audit.createdAt ?? new Date().toISOString();
        audit.startedAt = audit.startedAt ?? audit.createdAt ?? fallback;
        audit.lastActivityAt = audit.lastActivityAt ?? fallback;
      });

      const records = tx.table('auditRecords');
      await records.toCollection().modify((record: Partial<AuditRecord>) => {
        record.fieldDecision = record.fieldDecision ?? (record.status === 'correct' ? 'confirmed_match' : 'confirmed_physical_animal');
        record.reviewStatus = record.reviewStatus ?? (record.status === 'correct' ? 'not_required' : 'open');
        record.isCurrent = record.isCurrent ?? true;
        record.supersedesRecordId = record.supersedesRecordId ?? null;
        record.pairId = record.pairId ?? null;
        record.relatedRecordId = record.relatedRecordId ?? null;
      });
    });
  }
}

export const db = new BiptagDB();
export const newId = generateId;
