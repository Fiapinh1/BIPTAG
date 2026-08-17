import { db } from '../db/db';
import { supabase } from './supabase';
import type { Audit, AuditRecord, EffectiveTagAssignment, ImportIssue, KnownIssue, TagAssignment } from '../types/domain';

type SyncResult = {
  assignments: number;
  effectiveAssignments: number;
  records: number;
  issues: number;
  knownIssues: number;
};

export type PullResult = {
  audits: number;
  assignments: number;
  effectiveAssignments: number;
  records: number;
  issues: number;
  knownIssues: number;
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
    total_rows: audit.totalRows ?? audit.totalTags,
    valid_tags: audit.validTags ?? audit.totalTags,
    suspicious_tags: audit.suspiciousTags ?? 0,
    invalid_tags: audit.invalidTags ?? 0,
    tag_pattern: audit.tagPattern ?? null,
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
    last_detected_farm: assignment.lastDetectedFarm,
    validation_status: assignment.validationStatus ?? 'valid_tag',
    validation_reason: assignment.validationReason ?? null
  };
}

function effectiveRow(assignment: EffectiveTagAssignment, userId: string) {
  return {
    id: assignment.id,
    audit_id: assignment.auditId,
    user_id: userId,
    tag_number: assignment.tagNumber,
    original_animal: assignment.originalAnimal,
    effective_animal: assignment.effectiveAnimal,
    status: assignment.status,
    source_assignment_id: assignment.sourceAssignmentId,
    current_record_id: assignment.currentRecordId,
    related_record_id: assignment.relatedRecordId,
    updated_at: assignment.updatedAt,
    synced_at: syncedAt(),
    sync_status: assignment.syncStatus
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
    effective_animal: record.effectiveAnimal ?? null,
    status: record.status,
    field_decision: record.fieldDecision,
    review_status: record.reviewStatus,
    note: record.note,
    operational_action: record.operationalAction ?? null,
    action_note: record.actionNote ?? null,
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

function knownIssueRow(issue: KnownIssue, userId: string) {
  return {
    id: issue.id,
    audit_id: issue.auditId,
    user_id: userId,
    tag_number: issue.tagNumber,
    type: issue.type,
    note: issue.note,
    created_at: issue.createdAt,
    updated_at: issue.updatedAt,
    synced_at: syncedAt(),
    sync_status: issue.syncStatus
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

  const [assignments, records, issues, knownIssues] = await Promise.all([
    db.tagAssignments.where('auditId').equals(auditId).toArray(),
    db.auditRecords.where('auditId').equals(auditId).toArray(),
    db.importIssues.where('auditId').equals(auditId).toArray(),
    db.knownIssues.where('auditId').equals(auditId).toArray()
  ]);
  const effectiveAssignments = await db.effectiveTagAssignments.where('auditId').equals(auditId).toArray();

  const { error: auditError } = await client.from('audits').upsert(auditRow(audit, userId), { onConflict: 'id' });
  if (auditError) throw auditError;

  await upsertInChunks('tag_assignments', assignments.map((assignment) => assignmentRow(assignment, userId)));
  let effectiveSynced = false;
  try {
    await upsertInChunks('effective_tag_assignments', effectiveAssignments.map((assignment) => effectiveRow(assignment, userId)));
    effectiveSynced = true;
  } catch (err) {
    const message = typeof err === 'object' && err && 'message' in err ? String((err as { message?: unknown }).message) : String(err);
    if (!message.includes('effective_tag_assignments')) throw err;
    console.warn('Tabela effective_tag_assignments ainda nao existe no Supabase remoto. Sincronizacao local preservada.');
  }
  await upsertInChunks('audit_records', records.map((record) => recordRow(record, userId)));
  await upsertInChunks('import_issues', issues.map((issue) => issueRow(issue, userId)));
  let knownIssuesSynced = false;
  try {
    await upsertInChunks('known_issues', knownIssues.map((issue) => knownIssueRow(issue, userId)));
    knownIssuesSynced = true;
  } catch (err) {
    const message = typeof err === 'object' && err && 'message' in err ? String((err as { message?: unknown }).message) : String(err);
    if (!message.includes('known_issues')) throw err;
    console.warn('Tabela known_issues ainda nao existe no Supabase remoto. Problemas conhecidos continuam salvos offline.');
  }

  const synced = syncedAt();
  await db.auditRecords.where('auditId').equals(auditId).modify({
    syncedAt: synced,
    syncStatus: 'synced'
  });
  if (effectiveSynced) {
    await db.effectiveTagAssignments.where('auditId').equals(auditId).modify({
      syncedAt: synced,
      syncStatus: 'synced'
    });
  }
  if (knownIssuesSynced) {
    await db.knownIssues.where('auditId').equals(auditId).modify({
      syncStatus: 'synced'
    });
  }

  return {
    assignments: assignments.length,
    effectiveAssignments: effectiveSynced ? effectiveAssignments.length : 0,
    records: records.length,
    issues: issues.length,
    knownIssues: knownIssuesSynced ? knownIssues.length : 0
  };
}

export async function syncAllAuditsToSupabase() {
  await requireUserId();
  const audits = await db.audits.toArray();
  const results: SyncResult[] = [];
  for (const audit of audits) {
    results.push(await syncAuditToSupabase(audit.id));
  }
  return {
    audits: audits.length,
    assignments: results.reduce((sum, item) => sum + item.assignments, 0),
    effectiveAssignments: results.reduce((sum, item) => sum + item.effectiveAssignments, 0),
    records: results.reduce((sum, item) => sum + item.records, 0),
    issues: results.reduce((sum, item) => sum + item.issues, 0),
    knownIssues: results.reduce((sum, item) => sum + item.knownIssues, 0)
  };
}

export async function pullAuditsFromSupabase(): Promise<PullResult> {
  const client = requireSupabase();
  await requireUserId();

  const [
    auditsResponse,
    assignmentsResponse,
    effectiveResponse,
    recordsResponse,
    issuesResponse,
    knownIssuesResponse
  ] = await Promise.all([
    client.from('audits').select('*').order('updated_at', { ascending: false }),
    client.from('tag_assignments').select('*'),
    client.from('effective_tag_assignments').select('*'),
    client.from('audit_records').select('*'),
    client.from('import_issues').select('*'),
    client.from('known_issues').select('*')
  ]);

  if (auditsResponse.error) throw auditsResponse.error;
  if (assignmentsResponse.error) throw assignmentsResponse.error;
  if (recordsResponse.error) throw recordsResponse.error;
  if (issuesResponse.error) throw issuesResponse.error;
  if (effectiveResponse.error) {
    const message = effectiveResponse.error.message ?? '';
    if (!message.includes('effective_tag_assignments')) throw effectiveResponse.error;
  }
  if (knownIssuesResponse.error) {
    const message = knownIssuesResponse.error.message ?? '';
    if (!message.includes('known_issues')) throw knownIssuesResponse.error;
  }

  const audits = (auditsResponse.data ?? []).map((row) => ({
    id: row.id,
    farmName: row.farm_name,
    sourceFileName: row.source_file_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastActivityAt: row.last_activity_at,
    startedAt: row.started_at,
    pausedAt: row.paused_at ?? undefined,
    finishedAt: row.finished_at ?? undefined,
    status: row.status === 'active' ? 'in_progress' : row.status,
    totalTags: row.total_tags,
    totalRows: row.total_rows,
    validTags: row.valid_tags,
    suspiciousTags: row.suspicious_tags,
    invalidTags: row.invalid_tags,
    tagPattern: row.tag_pattern ?? undefined,
    linkedTags: row.linked_tags,
    issueCount: row.issue_count
  })) as Audit[];

  const assignments = (assignmentsResponse.data ?? []).map((row) => ({
    id: row.id,
    auditId: row.audit_id,
    tagNumber: row.tag_number,
    functionName: row.function_name,
    typeName: row.type_name,
    expectedAnimal: row.expected_animal,
    connectedSince: row.connected_since,
    lastDetectedAt: row.last_detected_at,
    lastDetectedFarm: row.last_detected_farm,
    validationStatus: row.validation_status,
    validationReason: row.validation_reason
  })) as TagAssignment[];

  const effectiveAssignments = (effectiveResponse.data ?? []).map((row) => ({
    id: row.id,
    auditId: row.audit_id,
    tagNumber: row.tag_number,
    originalAnimal: row.original_animal,
    effectiveAnimal: row.effective_animal,
    status: row.status,
    sourceAssignmentId: row.source_assignment_id,
    currentRecordId: row.current_record_id,
    relatedRecordId: row.related_record_id,
    updatedAt: row.updated_at,
    syncedAt: row.synced_at,
    syncStatus: 'synced'
  })) as EffectiveTagAssignment[];

  const records = (recordsResponse.data ?? []).map((row) => ({
    id: row.id,
    auditId: row.audit_id,
    sequence: row.sequence,
    tagNumber: row.tag_number,
    expectedAnimal: row.expected_animal,
    observedAnimal: row.observed_animal,
    effectiveAnimal: row.effective_animal,
    status: row.status,
    fieldDecision: row.field_decision,
    reviewStatus: row.review_status,
    note: row.note,
    operationalAction: row.operational_action,
    actionNote: row.action_note,
    scannedAt: row.scanned_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    syncedAt: row.synced_at,
    syncStatus: 'synced',
    source: row.source,
    isCurrent: row.is_current,
    supersedesRecordId: row.supersedes_record_id,
    pairId: row.pair_id,
    relatedRecordId: row.related_record_id
  })) as AuditRecord[];

  const issues = (issuesResponse.data ?? []).map((row) => ({
    id: row.id,
    auditId: row.audit_id,
    type: row.type,
    tagNumber: row.tag_number,
    animal: row.animal,
    detail: row.detail
  })) as ImportIssue[];

  const knownIssues = (knownIssuesResponse.data ?? []).map((row) => ({
    id: row.id,
    auditId: row.audit_id,
    tagNumber: row.tag_number,
    type: row.type,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    syncStatus: 'synced'
  })) as KnownIssue[];

  await db.transaction('rw', [db.audits, db.tagAssignments, db.effectiveTagAssignments, db.auditRecords, db.importIssues, db.knownIssues], async () => {
    if (audits.length) await db.audits.bulkPut(audits);
    if (assignments.length) await db.tagAssignments.bulkPut(assignments);
    if (effectiveAssignments.length) await db.effectiveTagAssignments.bulkPut(effectiveAssignments);
    if (records.length) await db.auditRecords.bulkPut(records);
    if (issues.length) await db.importIssues.bulkPut(issues);
    if (knownIssues.length) await db.knownIssues.bulkPut(knownIssues);
  });

  return {
    audits: audits.length,
    assignments: assignments.length,
    effectiveAssignments: effectiveAssignments.length,
    records: records.length,
    issues: issues.length,
    knownIssues: knownIssues.length
  };
}

export async function deleteAuditEverywhere(auditId: string) {
  const client = supabase;
  if (client) {
    const { data } = await client.auth.getSession();
    if (data.session) {
      const { error } = await client.from('audits').delete().eq('id', auditId);
      if (error) throw error;
    }
  }

  await db.transaction('rw', [db.audits, db.tagAssignments, db.effectiveTagAssignments, db.auditRecords, db.importIssues, db.knownIssues], async () => {
    await Promise.all([
      db.tagAssignments.where('auditId').equals(auditId).delete(),
      db.effectiveTagAssignments.where('auditId').equals(auditId).delete(),
      db.auditRecords.where('auditId').equals(auditId).delete(),
      db.importIssues.where('auditId').equals(auditId).delete(),
      db.knownIssues.where('auditId').equals(auditId).delete()
    ]);
    await db.audits.delete(auditId);
  });
}
