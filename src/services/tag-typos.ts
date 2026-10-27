import type { TagAssignment } from '../types/domain';

export function findTagTypoCandidates(assignments: TagAssignment[], tagNumber: string, observedAnimal: string | null) {
  if (!observedAnimal || !/^\d+$/.test(tagNumber)) return [];
  const seen = new Set<string>();
  return assignments.filter((assignment) => {
    if (assignment.expectedAnimal !== observedAnimal || assignment.validationStatus === 'invalid_tag' ||
      assignment.tagNumber.length !== tagNumber.length || !/^\d+$/.test(assignment.tagNumber) || seen.has(assignment.tagNumber)) return false;
    seen.add(assignment.tagNumber);
    let differences = 0;
    for (let i = 0; i < tagNumber.length; i++) {
      if (tagNumber[i] !== assignment.tagNumber[i] && ++differences > 1) return false;
    }
    return differences === 1;
  });
}
