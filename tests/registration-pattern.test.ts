import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/db/db';
import { createRegistrationFarm, saveRegisteredTag } from '../src/services/tag-registration';
import { manualPatternError, parseManualRegistrationTag, saveRegistrationPattern } from '../src/services/registration-pattern';

beforeEach(async () => { await db.registeredTags.clear(); await db.registrationFarms.clear(); });
const pattern = { prefix: '9840000', length: 15, numericOnly: true };
describe('padrão do lançamento manual por fazenda', () => {
  it('assembles the suffix, preserves leading zeros and accepts a matching full pasted tag', () => {
    expect(parseManualRegistrationTag('09159339', pattern)).toBe('984000009159339');
    expect(parseManualRegistrationTag('984000009159339', pattern)).toBe('984000009159339');
    expect(parseManualRegistrationTag('9840000 09159339', pattern)).toBe('984000009159339');
    expect(parseManualRegistrationTag('', pattern)).toBe('');
  });
  it('rejects excess digits, a different prefix and nonnumeric text without truncating identifiers', () => {
    expect(() => parseManualRegistrationTag('091593390', pattern)).toThrow('Nada foi cortado');
    expect(() => parseManualRegistrationTag('999000009159339', pattern)).toThrow('deve começar');
    expect(() => parseManualRegistrationTag('TAG 09159339', pattern)).toThrow('somente o número');
  });
  it('validates length and leaves space after the prefix', () => {
    for (const length of [0, 31, 1.5, NaN]) expect(manualPatternError({ ...pattern, length })).not.toBeNull();
    expect(manualPatternError({ ...pattern, prefix: 'abc' })).not.toBeNull();
    expect(manualPatternError({ ...pattern, length: 7 })).not.toBeNull();
    expect(manualPatternError(pattern)).toBeNull();
  });
  it('persists separate manual patterns without changing existing links', async () => {
    const a = await createRegistrationFarm('Fazenda A');
    const b = await createRegistrationFarm('Fazenda B');
    const record = await saveRegisteredTag({ farmId: a.id, tagNumber: '984000009159339', animal: '751', source: 'manual' });
    await saveRegistrationPattern(a.id, { prefix: '123', length: 10, numericOnly: true });
    expect((await db.registrationFarms.get(a.id))?.manualTagPattern?.length).toBe(10);
    expect((await db.registrationFarms.get(b.id))?.manualTagPattern).toBeUndefined();
    expect(await db.registeredTags.get(record.id)).toEqual(record);
    const corrected = await saveRegisteredTag({ farmId: a.id, tagNumber: record.tagNumber, animal: '752', source: 'manual', correction: { id: record.id, expectedUpdatedAt: record.updatedAt } });
    expect(corrected.animal).toBe('752');
  });
  it('enforces the configured length and prefix in the saving transaction', async () => {
    const farm = await createRegistrationFarm('Campo');
    await saveRegistrationPattern(farm.id, { prefix: '123', length: 10, numericOnly: true });
    await expect(saveRegisteredTag({ farmId: farm.id, tagNumber: '1230000001', animal: '751', source: 'manual' })).resolves.toMatchObject({ tagNumber: '1230000001' });
    await expect(saveRegisteredTag({ farmId: farm.id, tagNumber: '9990000002', animal: '752', source: 'manual' })).rejects.toThrow('começar com 123');
    await expect(saveRegisteredTag({ farmId: farm.id, tagNumber: '123000001', animal: '752', source: 'manual' })).rejects.toThrow('10 dígitos');
    expect(await db.registeredTags.count()).toBe(1);
  });
  it.each(['nfc', 'bluetooth'] as const)('keeps %s readings independent from the manual pattern', async (source) => {
    const farm = await createRegistrationFarm('Campo');
    await saveRegistrationPattern(farm.id, { prefix: '123', length: 10, numericOnly: true });
    await expect(saveRegisteredTag({ farmId: farm.id, tagNumber: '984000009159339', animal: '751', source })).resolves.toMatchObject({ source, tagNumber: '984000009159339' });
    await expect(saveRegisteredTag({ farmId: farm.id, tagNumber: '000000000000000', animal: '752', source })).rejects.toThrow('zeros');
  });
});
