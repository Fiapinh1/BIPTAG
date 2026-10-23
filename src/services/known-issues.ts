import { validateSmartTag } from './excel';
import type { SmartTagPattern, TagAssignment } from '../types/domain';

export function composeKnownIssueTag(input: string, pattern?: SmartTagPattern | null) {
  const digits = input.replace(/[^0-9]/g, '');
  if (!digits || !pattern?.prefix || digits.length >= pattern.length) return digits;
  return `${pattern.prefix}${digits}`;
}

export function knownIssueTagError(
  tagNumber: string,
  assignments: Pick<TagAssignment, 'tagNumber' | 'validationStatus'>[],
  pattern?: SmartTagPattern | null
): string | null {
  if (!tagNumber) return 'Informe a SmartTag do problema conhecido.';
  const matches = assignments.filter((item) => item.tagNumber === tagNumber);
  if (!matches.length) return 'Esta SmartTag não está na planilha importada. Confira o número e tente novamente.';
  if (!matches.some((item) => item.validationStatus === 'valid_tag')
    || (pattern && validateSmartTag(tagNumber, pattern).status !== 'valid_tag')) {
    return 'Esta SmartTag não é válida para o padrão confirmado. Confira o número e o padrão da planilha.';
  }
  return null;
}
