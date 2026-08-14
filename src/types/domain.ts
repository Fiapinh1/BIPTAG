export type AuditStatus = 'draft' | 'active' | 'in_progress' | 'paused' | 'finished';

export type RecordStatus =
  | 'correct'
  | 'divergence'
  | 'reassignment'
  | 'linked'
  | 'new_tag'
  | 'possible_swap'
  | 'replacement_chain'
  | 'tag_not_registered'
  | 'tag_not_found'
  | 'tag_without_animal'
  | 'animal_not_in_base'
  | 'unconfirmed'
  | 'suspicious_tag'
  | 'possible_typo';

export type FieldDecision =
  | 'confirmed_match'
  | 'confirmed_physical_animal'
  | 'could_not_confirm'
  | 'review_later';

export type ReviewStatus = 'open' | 'resolved' | 'not_required';
export type SyncStatus = 'pending' | 'synced' | 'error';
export type TagValidationStatus = 'valid_tag' | 'suspicious_tag' | 'invalid_tag';
export type EffectiveTagStatus =
  | 'pending'
  | 'confirmed'
  | 'reassigned'
  | 'linked'
  | 'new_tag'
  | 'displaced'
  | 'not_found'
  | 'suspicious'
  | 'invalid'
  | 'unresolved';

export type ImportIssueType =
  | 'duplicate_tag'
  | 'multiple_tags_same_animal'
  | 'tag_without_animal'
  | 'suspicious_tag'
  | 'invalid_tag'
  | 'possible_typo';

export interface SmartTagPattern {
  prefix: string;
  length: number;
  numericOnly: boolean;
}

export interface Audit {
  id: string;
  farmName: string;
  sourceFileName: string;
  createdAt: string;
  updatedAt: string;
  lastActivityAt: string;
  startedAt: string;
  pausedAt?: string;
  finishedAt?: string;
  status: AuditStatus;
  totalTags: number;
  totalRows?: number;
  validTags?: number;
  suspiciousTags?: number;
  invalidTags?: number;
  tagPattern?: SmartTagPattern;
  linkedTags: number;
  issueCount: number;
}

export interface TagAssignment {
  id: string;
  auditId: string;
  tagNumber: string;
  functionName: string | null;
  typeName: string | null;
  expectedAnimal: string | null;
  connectedSince: string | null;
  lastDetectedAt: string | null;
  lastDetectedFarm: string | null;
  validationStatus?: TagValidationStatus;
  validationReason?: string | null;
}

export interface AuditRecord {
  id: string;
  auditId: string;
  sequence: number;
  tagNumber: string;
  expectedAnimal: string | null;
  observedAnimal: string | null;
  effectiveAnimal?: string | null;
  status: RecordStatus;
  fieldDecision: FieldDecision;
  reviewStatus: ReviewStatus;
  note: string | null;
  scannedAt: string;
  createdAt: string;
  updatedAt: string;
  syncedAt: string | null;
  syncStatus: SyncStatus;
  source: 'nfc' | 'manual';
  isCurrent: boolean;
  supersedesRecordId: string | null;
  pairId: string | null;
  relatedRecordId: string | null;
}

export interface EffectiveTagAssignment {
  id: string;
  auditId: string;
  tagNumber: string;
  originalAnimal: string | null;
  effectiveAnimal: string | null;
  status: EffectiveTagStatus;
  sourceAssignmentId: string | null;
  currentRecordId: string | null;
  relatedRecordId: string | null;
  updatedAt: string;
  syncedAt: string | null;
  syncStatus: SyncStatus;
}

export interface ImportIssue {
  id: string;
  auditId: string;
  type: ImportIssueType;
  tagNumber: string | null;
  animal: string | null;
  detail: string;
}

export interface ImportPreview {
  assignments: Omit<TagAssignment, 'id' | 'auditId'>[];
  issues: Omit<ImportIssue, 'id' | 'auditId'>[];
  stats: {
    totalRows: number;
    totalTags: number;
    validTags: number;
    suspiciousTags: number;
    invalidTags: number;
    linkedTags: number;
    tagsWithoutAnimal: number;
    duplicateTags: number;
    animalsWithMultipleTags: number;
  };
  pattern: SmartTagPattern;
}
