import { describe, expect, it } from 'vitest';
import { composeKnownIssueTag, knownIssueTagError } from '../src/services/known-issues';
import type { SmartTagPattern } from '../src/types/domain';

const pattern: SmartTagPattern = { prefix: '9840000', length: 15, numericOnly: true };
const assignments = [
  { tagNumber: '984000010514961', validationStatus: 'valid_tag' as const },
  { tagNumber: '984000098400001', validationStatus: 'valid_tag' as const },
  { tagNumber: '123000010514961', validationStatus: 'suspicious_tag' as const },
  { tagNumber: '9840000123', validationStatus: 'invalid_tag' as const }
];

describe('known issue tags', () => {
  it('accepts an imported valid tag entered as a suffix or a full number', () => {
    for (const input of ['10514961', '984000010514961', '9840000 10514961']) {
      expect(knownIssueTagError(composeKnownIssueTag(input, pattern), assignments, pattern)).toBeNull();
    }
  });

  it('adds the prefix even when the suffix starts with the same digits', () => {
    const tag = composeKnownIssueTag('98400001', pattern);
    expect(tag).toBe('984000098400001');
    expect(knownIssueTagError(tag, assignments, pattern)).toBeNull();
  });

  it('rejects a correctly formatted tag absent from the imported spreadsheet', () => {
    expect(knownIssueTagError('984000099999999', assignments, pattern)).toContain('não está na planilha');
  });

  it('rejects empty input without turning it into a prefix-only tag', () => {
    expect(composeKnownIssueTag('', pattern)).toBe('');
    expect(knownIssueTagError('', assignments, pattern)).toContain('Informe a SmartTag');
  });

  it('preserves a pasted full number with a different prefix and rejects it', () => {
    const tag = composeKnownIssueTag('123000010514961', pattern);
    expect(tag).toBe('123000010514961');
    expect(knownIssueTagError(tag, assignments, pattern)).toContain('não é válida');
  });

  it('rejects an invalid imported tag', () => {
    expect(knownIssueTagError('9840000123', assignments, pattern)).toContain('não é válida');
  });

  it('rechecks a draft against a changed pattern', () => {
    expect(knownIssueTagError(assignments[0].tagNumber, assignments, { ...pattern, prefix: '1230000' })).toContain('não é válida');
  });

  it('accepts valid imported tags when there is no fixed prefix', () => {
    const noPrefix = { ...pattern, prefix: '' };
    expect(composeKnownIssueTag(assignments[0].tagNumber, noPrefix)).toBe(assignments[0].tagNumber);
    expect(knownIssueTagError(assignments[0].tagNumber, assignments, noPrefix)).toBeNull();
  });
});
