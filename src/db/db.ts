import Dexie, { type EntityTable } from 'dexie';
import type { Audit, AuditRecord, EffectiveTagAssignment, ImportIssue, KnownIssue, TagAssignment } from '../types/domain';
import { generateId } from '../utils/id';

class BiptagDB extends Dexie {
  audits!: EntityTable<Audit, 'id'>;
  tagAssignments!: EntityTable<TagAssignment, 'id'>;
  effectiveTagAssignments!: EntityTable<EffectiveTagAssignment, 'id'>;
  auditRecords!: EntityTable<AuditRecord, 'id'>;
  importIssues!: EntityTable<ImportIssue, 'id'>;
  knownIssues!: EntityTable<KnownIssue, 'id'>;

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

    this.version(3).stores({
      audits: 'id, status, createdAt, updatedAt, lastActivityAt, farmName',
      tagAssignments:
        'id, auditId, tagNumber, expectedAnimal, [auditId+tagNumber], [auditId+expectedAnimal]',
      auditRecords:
        'id, auditId, sequence, tagNumber, status, isCurrent, reviewStatus, scannedAt, createdAt, updatedAt, syncStatus, expectedAnimal, observedAnimal, pairId, [auditId+tagNumber], [auditId+sequence]',
      importIssues: 'id, auditId, type, tagNumber, animal'
    }).upgrade(async (tx) => {
      const audits = tx.table('audits');
      await audits.toCollection().modify((audit: Partial<Audit>) => {
        if (audit.status === 'active') audit.status = 'in_progress';
      });

      const records = tx.table('auditRecords');
      const allRecords = (await records.toArray()) as Partial<AuditRecord>[];
      const byAudit = new Map<string, Partial<AuditRecord>[]>();

      for (const record of allRecords) {
        if (!record.auditId) continue;
        const list = byAudit.get(record.auditId) ?? [];
        list.push(record);
        byAudit.set(record.auditId, list);
      }

      for (const list of byAudit.values()) {
        list.sort((a, b) => {
          const aTime = a.scannedAt ?? a.createdAt ?? '';
          const bTime = b.scannedAt ?? b.createdAt ?? '';
          return aTime.localeCompare(bTime);
        });

        for (const [index, record] of list.entries()) {
          const fallback = record.scannedAt ?? record.updatedAt ?? record.createdAt ?? new Date().toISOString();
          await records.update(record.id, {
            sequence: record.sequence ?? index + 1,
            createdAt: record.createdAt ?? fallback,
            updatedAt: record.updatedAt ?? fallback,
            syncedAt: record.syncedAt ?? null,
            syncStatus: record.syncStatus ?? 'pending'
          });
        }
      }
    });

    this.version(4).stores({
      audits: 'id, status, createdAt, updatedAt, lastActivityAt, farmName',
      tagAssignments:
        'id, auditId, tagNumber, expectedAnimal, validationStatus, [auditId+tagNumber], [auditId+expectedAnimal]',
      effectiveTagAssignments:
        'id, auditId, tagNumber, effectiveAnimal, status, currentRecordId, syncStatus, [auditId+tagNumber], [auditId+effectiveAnimal], [auditId+status]',
      auditRecords:
        'id, auditId, sequence, tagNumber, status, isCurrent, reviewStatus, scannedAt, createdAt, updatedAt, syncStatus, expectedAnimal, observedAnimal, effectiveAnimal, pairId, [auditId+tagNumber], [auditId+sequence]',
      importIssues: 'id, auditId, type, tagNumber, animal'
    }).upgrade(async (tx) => {
      const audits = tx.table('audits');
      const assignments = tx.table('tagAssignments');
      const effective = tx.table('effectiveTagAssignments');
      const records = tx.table('auditRecords');

      await audits.toCollection().modify((audit: Partial<Audit>) => {
        audit.totalRows = audit.totalRows ?? audit.totalTags ?? 0;
        audit.validTags = audit.validTags ?? audit.totalTags ?? 0;
        audit.suspiciousTags = audit.suspiciousTags ?? 0;
        audit.invalidTags = audit.invalidTags ?? 0;
        audit.tagPattern = audit.tagPattern ?? { prefix: '9840000', length: 15, numericOnly: true };
      });

      await assignments.toCollection().modify((assignment: Partial<TagAssignment>) => {
        assignment.validationStatus = assignment.validationStatus ?? 'valid_tag';
        assignment.validationReason = assignment.validationReason ?? null;
      });

      await records.toCollection().modify((record: Partial<AuditRecord>) => {
        record.effectiveAnimal = record.effectiveAnimal ?? record.observedAnimal ?? record.expectedAnimal ?? null;
      });

      const allAssignments = (await assignments.toArray()) as TagAssignment[];
      const allRecords = (await records.toArray()) as AuditRecord[];
      const currentRecordByTag = new Map<string, AuditRecord>();
      for (const record of allRecords.filter((item) => item.isCurrent !== false)) {
        currentRecordByTag.set(`${record.auditId}:${record.tagNumber}`, record);
      }

      for (const assignment of allAssignments) {
        const key = `${assignment.auditId}:${assignment.tagNumber}`;
        const currentRecord = currentRecordByTag.get(key);
        const status = assignment.validationStatus === 'invalid_tag'
          ? 'invalid'
          : assignment.validationStatus === 'suspicious_tag'
            ? 'suspicious'
            : currentRecord
              ? currentRecord.status === 'correct'
                ? 'confirmed'
                : currentRecord.status === 'tag_not_found'
                  ? 'not_found'
                  : currentRecord.status === 'tag_without_animal'
                    ? 'linked'
                    : currentRecord.status === 'unconfirmed'
                      ? 'unresolved'
                      : 'reassigned'
              : 'pending';

        await effective.add({
          id: newId('effective'),
          auditId: assignment.auditId,
          tagNumber: assignment.tagNumber,
          originalAnimal: assignment.expectedAnimal,
          effectiveAnimal: currentRecord?.observedAnimal ?? assignment.expectedAnimal ?? null,
          status,
          sourceAssignmentId: assignment.id,
          currentRecordId: currentRecord?.id ?? null,
          relatedRecordId: currentRecord?.relatedRecordId ?? null,
          updatedAt: currentRecord?.updatedAt ?? new Date().toISOString(),
          syncedAt: null,
          syncStatus: 'pending'
        });
      }
    });

    this.version(5).stores({
      audits: 'id, status, createdAt, updatedAt, lastActivityAt, farmName',
      tagAssignments:
        'id, auditId, tagNumber, expectedAnimal, validationStatus, [auditId+tagNumber], [auditId+expectedAnimal]',
      effectiveTagAssignments:
        'id, auditId, tagNumber, effectiveAnimal, status, currentRecordId, syncStatus, [auditId+tagNumber], [auditId+effectiveAnimal], [auditId+status]',
      auditRecords:
        'id, auditId, sequence, tagNumber, status, operationalAction, isCurrent, reviewStatus, scannedAt, createdAt, updatedAt, syncStatus, expectedAnimal, observedAnimal, effectiveAnimal, pairId, [auditId+tagNumber], [auditId+sequence]',
      importIssues: 'id, auditId, type, tagNumber, animal'
    }).upgrade(async (tx) => {
      const records = tx.table('auditRecords');
      await records.toCollection().modify((record: Partial<AuditRecord>) => {
        record.operationalAction = record.operationalAction ?? defaultOperationalAction(record.status);
        record.actionNote = record.actionNote ?? null;
      });
    });

    this.version(6).stores({
      audits: 'id, status, createdAt, updatedAt, lastActivityAt, farmName',
      tagAssignments:
        'id, auditId, tagNumber, expectedAnimal, validationStatus, [auditId+tagNumber], [auditId+expectedAnimal]',
      effectiveTagAssignments:
        'id, auditId, tagNumber, effectiveAnimal, status, currentRecordId, syncStatus, [auditId+tagNumber], [auditId+effectiveAnimal], [auditId+status]',
      auditRecords:
        'id, auditId, sequence, tagNumber, status, operationalAction, isCurrent, reviewStatus, scannedAt, createdAt, updatedAt, syncStatus, expectedAnimal, observedAnimal, effectiveAnimal, pairId, [auditId+tagNumber], [auditId+sequence]',
      importIssues: 'id, auditId, type, tagNumber, animal',
      knownIssues: 'id, auditId, tagNumber, type, createdAt, updatedAt, syncStatus, [auditId+tagNumber], [auditId+type]'
    });
  }
}

export const db = new BiptagDB();
export const newId = generateId;

function defaultOperationalAction(status: AuditRecord['status'] | undefined) {
  if (status === 'correct') return 'keep_tag';
  if (status === 'possible_swap') return 'swap_tags';
  if (status === 'new_tag') return 'register_new_tag';
  if (status === 'linked' || status === 'tag_without_animal') return 'link_tag';
  return status ? 'investigate' : null;
}
