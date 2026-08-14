import { db } from '../db/db';
import { supabase } from './supabase';
import type { Audit, AuditRecord, ImportIssue, TagAssignment } from '../types/domain';

type SyncResult = {
  assignments: number;
  records: number;
  issues: number;
};

const syncedAt = () => new Date().toISOString();

function requireSupabase() {
  if (!supabase) {
    throw new Error('Supabase nao configurado. Confira as variaveis VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.');
  }
  return supabase;
}

async function requireUserId() {
  const client = requireSupabase();
  const { data, error } = await client.auth.getUser();
  if (error) throw error;
  if (!data.user) {
    throw new Error('Entre com seu e-mail antes de sincronizar.');
  }
  return data.user.id;
}

function auditRow(audit: Audit, userId: string) {
  return {
    id: audit.id,
    user_id: userId,
    farm_id: null,
    farm_name: audit.farmName,
    source_file_name: audit.sourceFileName,
    status: audit.status,
    total_tags: audit.totalTags,
    linked_tags: audit.linkedTags,
    issue_count: audit.issueCount,
    started_at: audit.startedAt,
    created_at: audit.createdAt,
    updated_at: audit.updatedAt,
    last_activity_at: audit.lastActivityAt,
    paused_at: audit.pausedAt ?? null,
    finished_at: audit.finishedAt ?? null,
    synced_at: syncedAt()
  };
}

function assignmentRow(assignment: TagAssignment, userId: string) {
  return {
    id: assignment.id,
    audit_id: assignment.auditId,
    user_id: userId,
    tag_number: assignment.tagNumber,
    function_name: assignment.functionName,
    type_name: assignment.typeName,
    expected_animal: assignment.expectedAnimal,
    connected_since: assignment.connectedSince,
    last_detected_at: assignment.lastDetectedAt,
    last_detected_farm: assignment.lastDetectedFarm
  };
}

function recordRow(record: AuditRecord, userId: string) {
  return {
    id: record.id,
    audit_id: record.auditId,
    user_id: userId,
    sequence: record.sequence,
    tag_number: record.tagNumber,
    expected_animal: record.expectedAnimal,
    observed_animal: record.observedAnimal,
    status: record.status,
    field_decision: record.fieldDecision,
    review_status: record.reviewStatus,
    note: record.note,
    scanned_at: record.scannedAt,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
    source: record.source,
    is_current: record.isCurrent,
    supersedes_record_id: record.supersedesRecordId,
    pair_id: record.pairId,
    related_record_id: record.relatedRecordId,
    synced_at: syncedAt(),
    sync_status: record.syncStatus
  };
}

function issueRow(issue: ImportIssue, userId: string) {
  return {
    id: issue.id,
    audit_id: issue.auditId,
    user_id: userId,
    type: issue.type,
    tag_number: issue.tagNumber,
    animal: issue.animal,
    detail: issue.detail
  };
}

async function upsertInChunks(table: string, rows: Record<string, unknown>[], size = 500) {
  if (!rows.length) return;
  const client = requireSupabase();
  for (let index = 0; index < rows.length; index += size) {
    const chunk = rows.slice(index, index + size);
    const { error } = await client.from(table).upsert(chunk as never, { onConflict: 'id' });
    if (error) throw error;
  }
}

export async function syncAuditToSupabase(auditId: string): Promise<SyncResult> {
  const client = requireSupabase();
  const userId = await requireUserId();
  const audit = await db.audits.get(auditId);
  if (!audit) throw new Error('Auditoria local nao encontrada.');

  const [assignments, records, issues] = await Promise.all([
    db.tagAssignments.where('auditId').equals(auditId).toArray(),
    db.auditRecords.where('auditId').equals(auditId).toArray(),
    db.importIssues.where('auditId').equals(auditId).toArray()
  ]);

  const { error: auditError } = await client.from('audits').upsert(auditRow(audit, userId), { onConflict: 'id' });
  if (auditError) throw auditError;

  await upsertInChunks('tag_assignments', assignments.map((assignment) => assignmentRow(assignment, userId)));
  await upsertInChunks('audit_records', records.map((record) => recordRow(record, userId)));
  await upsertInChunks('import_issues', issues.map((issue) => issueRow(issue, userId)));

  const synced = syncedAt();
  await db.auditRecords.where('auditId').equals(auditId).modify({
    syncedAt: synced,
    syncStatus: 'synced'
  });

  return {
    assignments: assignments.length,
    records: records.length,
    issues: issues.length
  };
}
