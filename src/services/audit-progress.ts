import type { AuditRecord, EffectiveTagAssignment } from '../types/domain';

export function getFieldReadingProgress(records: AuditRecord[], effectiveAssignments: EffectiveTagAssignment[], baseTarget: number) {
  // Corrections and rereads are history for one physical tag; marking it missing is not a read.
  const readTags = new Set(records.filter((record) => record.status !== 'tag_not_found').map((record) => record.tagNumber));
  const baseTags = new Set(effectiveAssignments.filter((item) => item.sourceAssignmentId !== null).map((item) => item.tagNumber));
  const outsideBase = [...readTags].filter((tag) => !baseTags.has(tag)).length;
  return { readCount: readTags.size, outsideBase, fieldPercent: baseTarget ? Math.min(100, readTags.size / baseTarget * 100) : 0 };
}
