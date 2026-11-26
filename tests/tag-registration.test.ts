import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { db } from '../src/db/db';
import { createRegistrationFarm, saveRegisteredTag } from '../src/services/tag-registration';
import { createRegistrationWorkbook } from '../src/services/registration-export';

beforeEach(async () => {
  await db.registeredTags.clear();
  await db.registrationFarms.clear();
});

const input = { tagNumber: '984000009159339', animal: '751', source: 'nfc' as const };

describe('cadastro inicial sem planilha', () => {
  it('creates a separate farm and persists the first link without an audit or imported base', async () => {
    const auditCount = await db.audits.count();
    const assignmentCount = await db.tagAssignments.count();
    const farm = await createRegistrationFarm(' Fazenda São João ');
    const record = await saveRegisteredTag({ farmId: farm.id, ...input });
    expect(await db.registeredTags.get(record.id)).toEqual(record);
    expect(record.animal).toBe('751');
    expect(record.source).toBe('nfc');
    expect(await db.audits.count()).toBe(auditCount);
    expect(await db.tagAssignments.count()).toBe(assignmentCount);
  });

  it('resumes an existing farm despite case, repeated spaces or accents', async () => {
    const [first, second] = await Promise.all([createRegistrationFarm('São João'), createRegistrationFarm('  sao  JOAO ')]);
    expect(second.id).toBe(first.id);
    expect(await db.registrationFarms.count()).toBe(1);
  });

  it('never overwrites a duplicate reading or permits a second tag for the same animal', async () => {
    const farm = await createRegistrationFarm('Campo');
    const first = await saveRegisteredTag({ farmId: farm.id, ...input });
    await expect(saveRegisteredTag({ farmId: farm.id, ...input, animal: '752' })).rejects.toThrow('já está cadastrada');
    await expect(saveRegisteredTag({ farmId: farm.id, ...input, tagNumber: '984000009159340' })).rejects.toThrow('já tem a tag');
    expect(await db.registeredTags.get(first.id)).toEqual(first);
    expect(await db.registeredTags.count()).toBe(1);
  });

  it('serializes simultaneous submissions so only one duplicate is recorded', async () => {
    const farm = await createRegistrationFarm('Campo');
    const attempts = await Promise.allSettled([
      saveRegisteredTag({ farmId: farm.id, ...input }), saveRegisteredTag({ farmId: farm.id, ...input })
    ]);
    expect(attempts.filter((attempt) => attempt.status === 'fulfilled')).toHaveLength(1);
    expect(await db.registeredTags.count()).toBe(1);
  });

  it('keeps links isolated between farms', async () => {
    const first = await createRegistrationFarm('Fazenda A');
    const second = await createRegistrationFarm('Fazenda B');
    await saveRegisteredTag({ farmId: first.id, ...input });
    await saveRegisteredTag({ farmId: second.id, ...input });
    expect(await db.registeredTags.count()).toBe(2);
  });

  it.each(['000000000000000', '2', '9840000091593391', '+KEY=2', '98400000915x339'])('rejects an invalid identifier %s without recording it', async (tagNumber) => {
    const farm = await createRegistrationFarm('Campo');
    await expect(saveRegisteredTag({ farmId: farm.id, ...input, tagNumber })).rejects.toThrow();
    expect(await db.registeredTags.count()).toBe(0);
  });

  it('requires an existing farm and an animal number', async () => {
    await expect(saveRegisteredTag({ farmId: 'missing', ...input })).rejects.toThrow('Selecione a fazenda');
    const farm = await createRegistrationFarm('Campo');
    await expect(saveRegisteredTag({ farmId: farm.id, ...input, animal: '' })).rejects.toThrow('brinco');
    await expect(saveRegisteredTag({ farmId: farm.id, ...input, animal: '7a51' })).rejects.toThrow('brinco');
    expect(await db.registeredTags.count()).toBe(0);
  });

  it('corrects a link explicitly and retains its previous animal and initial date', async () => {
    const farm = await createRegistrationFarm('Campo');
    const record = await saveRegisteredTag({ farmId: farm.id, ...input });
    const updated = await saveRegisteredTag({ farmId: farm.id, ...input, animal: '00752', correction: { id: record.id, expectedUpdatedAt: record.updatedAt } });
    expect(updated.id).toBe(record.id);
    expect(updated.createdAt).toBe(record.createdAt);
    expect(updated.animal).toBe('00752');
    expect(updated.corrections).toEqual([{ tagNumber: input.tagNumber, animal: '751', changedAt: updated.updatedAt }]);
    expect(updated.updatedAt > record.updatedAt).toBe(true);
    await expect(saveRegisteredTag({ farmId: farm.id, ...input, animal: '753', correction: { id: record.id, expectedUpdatedAt: record.updatedAt } })).rejects.toThrow('cadastro mudou');
    expect(await db.registeredTags.count()).toBe(1);
  });

  it('rejects stale corrections and does not take another animal’s link', async () => {
    const farm = await createRegistrationFarm('Campo');
    const record = await saveRegisteredTag({ farmId: farm.id, ...input });
    await expect(saveRegisteredTag({ farmId: farm.id, ...input, animal: '900', correction: { id: record.id, expectedUpdatedAt: 'stale' } })).rejects.toThrow('cadastro mudou');
    await saveRegisteredTag({ farmId: farm.id, ...input, tagNumber: '984000009159340', animal: '900' });
    await expect(saveRegisteredTag({ farmId: farm.id, ...input, animal: '900', correction: { id: record.id, expectedUpdatedAt: record.updatedAt } })).rejects.toThrow('já tem a tag');
    expect((await db.registeredTags.get(record.id))?.animal).toBe('751');
  });

  it('corrects a mistyped tag without creating a second animal or overwriting a different tag', async () => {
    const farm = await createRegistrationFarm('Campo');
    const record = await saveRegisteredTag({ farmId: farm.id, ...input });
    const updated = await saveRegisteredTag({ farmId: farm.id, ...input, tagNumber: '984000009159340', correction: { id: record.id, expectedUpdatedAt: record.updatedAt } });
    expect(updated.id).toBe(record.id);
    expect(updated.corrections[0].tagNumber).toBe(input.tagNumber);
    expect(await db.registeredTags.where('[farmId+tagNumber]').equals([farm.id, input.tagNumber]).count()).toBe(0);
    const other = await saveRegisteredTag({ farmId: farm.id, ...input, animal: '900' });
    await expect(saveRegisteredTag({ farmId: farm.id, ...input, animal: '901', correction: { id: updated.id, expectedUpdatedAt: updated.updatedAt } })).rejects.toThrow('já está cadastrada');
    expect((await db.registeredTags.get(other.id))?.animal).toBe('900');
    expect(await db.registeredTags.count()).toBe(2);
  });

  it('exports just the farm, tag, animal and date while keeping identifiers as text', async () => {
    const farm = await createRegistrationFarm('Campo');
    const record = await saveRegisteredTag({ farmId: farm.id, ...input, animal: '000751', source: 'bluetooth' });
    const workbook = createRegistrationWorkbook(farm, [record]);
    const bytes = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
    const restored = XLSX.read(bytes, { type: 'array' });
    expect(restored.SheetNames).toEqual(['CADASTRO DE TAGS']);
    const sheet = restored.Sheets['CADASTRO DE TAGS'];
    expect(sheet.B2.v).toBe('Campo');
    expect(XLSX.utils.sheet_to_json(sheet, { header: 1 }).slice(3)).toEqual([
      ['SMARTTAG', 'ANIMAL', 'DATA DO CADASTRO'], [input.tagNumber, '000751', new Date(record.createdAt).toLocaleString('pt-BR')]
    ]);
    expect(sheet.A5.t).toBe('s');
    expect(sheet.B5.t).toBe('s');
  });
});
