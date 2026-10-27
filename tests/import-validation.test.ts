import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';
import { parseNedapWorkbook } from '../src/services/excel';

async function parseRows(rows: unknown[][]) {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['Numero de tag', 'Animal', 'Funcao'], ...rows]), 'Tags');
  const buffer = XLSX.write(book, { type: 'array', bookType: 'xlsx' });
  return parseNedapWorkbook({ arrayBuffer: async () => buffer } as File);
}

describe('Import warnings from actual tag and animal data', () => {
  it('ignores empty or metadata-only rows without reporting missing SmartTags', async () => {
    const preview = await parseRows([['984000009256954', '751'], [], ['', '', ''], [null, null, 'Observação do arquivo']]);
    expect(preview.assignments).toHaveLength(1);
    expect(preview.issues).toHaveLength(0);
  });

  it('keeps a real animal-without-tag warning with its original Excel row number', async () => {
    const preview = await parseRows([['984000009256954', '751'], [], [null, '888']]);
    expect(preview.issues).toEqual([expect.objectContaining({ type: 'invalid_tag', animal: '888', tagNumber: null, detail: 'Linha 4: animal 888 sem número de SmartTag.' })]);
    expect(preview.stats.invalidTags).toBe(1);
  });

  it('does not confuse a duplicate row with multiple different tags on the same animal', async () => {
    const preview = await parseRows([['984000009256954', '751'], ['984000009256954', '751']]);
    expect(preview.stats.animalsWithMultipleTags).toBe(0);
    expect(preview.stats.duplicateTags).toBe(1);
    expect(preview.stats.totalTags).toBe(1);
    expect(preview.stats.validTags).toBe(1);
    expect(preview.stats.linkedTags).toBe(1);
  });

  it('does not count malformed numbers as extra SmartTags for an animal', async () => {
    const preview = await parseRows([['984000009256954', '751'], ['12', '751']]);
    expect(preview.stats.animalsWithMultipleTags).toBe(0);
    expect(preview.issues.some((item) => item.type === 'invalid_tag')).toBe(true);
  });

  it('keeps genuine multiple-tag warnings with the animal and both complete numbers', async () => {
    const preview = await parseRows([['984000009256954', '751'], ['984000009156954', '751']]);
    expect(preview.stats.animalsWithMultipleTags).toBe(1);
    expect(preview.stats.totalTags).toBe(2);
    expect(preview.stats.linkedTags).toBe(1);
    expect(preview.issues).toEqual([expect.objectContaining({ type: 'multiple_tags_same_animal', animal: '751', detail: expect.stringContaining('984000009256954 e 984000009156954') })]);
  });
});
