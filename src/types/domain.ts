export type AuditStatus = 'draft' | 'active' | 'paused' | 'finished';

export type RecordStatus =
  | 'correct'
  | 'divergence'
  | 'possible_swap'
  | 'tag_not_found'
  | 'tag_without_animal'
  | 'animal_not_in_base'
  | 'unconfirmed';

export type FieldDecision =
  | 'confirmed_match'
  | 'confirmed_physical_animal'
  | 'could_not_confirm'
  | 'review_later';

export type ReviewStatus = 'open' | 'resolved' | 'not_required';

export type ImportIssueType =
  | 'duplicate_tag'
  | 'multiple_tags_same_animal'
  | 'tag_without_animal';

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
}

export interface AuditRecord {
  id: string;
  auditId: string;
  tagNumber: string;
  expectedAnimal: string | null;
  observedAnimal: string | null;
  status: RecordStatus;
  fieldDecision: FieldDecision;
  reviewStatus: ReviewStatus;
  note: string | null;
  scannedAt: string;
  source: 'nfc' | 'manual';
  isCurrent: boolean;
  supersedesRecordId: string | null;
  pairId: string | null;
  relatedRecordId: string | null;
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
    totalTags: number;
    linkedTags: number;
    tagsWithoutAnimal: number;
    duplicateTags: number;
    animalsWithMultipleTags: number;
  };
}
