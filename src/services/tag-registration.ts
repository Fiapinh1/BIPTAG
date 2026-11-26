import { db, newId } from '../db/db';
import type { RegisteredTag, RegistrationFarm } from '../types/registration';
import type { SmartTagPattern } from '../types/domain';
import { DEFAULT_MANUAL_PATTERN } from './registration-pattern';

export function registrationFarmKey(name: string) {
  return name.trim().replace(/\s+/g, ' ').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
}

export async function createRegistrationFarm(name: string): Promise<RegistrationFarm> {
  const clean = name.trim().replace(/\s+/g, ' ');
  if (!clean || clean.length > 100) throw new Error('Informe um nome de fazenda com até 100 caracteres.');
  return db.transaction('rw', db.registrationFarms, async () => {
    const nameKey = registrationFarmKey(clean);
    const existing = await db.registrationFarms.where('nameKey').equals(nameKey).first();
    if (existing) return existing;
    const now = new Date().toISOString();
    const farm: RegistrationFarm = { id: newId('farm'), name: clean, nameKey, createdAt: now, updatedAt: now };
    await db.registrationFarms.add(farm);
    return farm;
  });
}

export function registrationTagError(tagNumber: string, pattern: SmartTagPattern = DEFAULT_MANUAL_PATTERN) {
  if (!/^\d+$/.test(tagNumber) || tagNumber.length !== pattern.length) return `Informe os ${pattern.length} dígitos da SmartTag, sem letras ou símbolos.`;
  if (/^0+$/.test(tagNumber)) return 'Uma tag só com zeros não é válida. Leia novamente ou confira a etiqueta.';
  if (pattern.prefix && !tagNumber.startsWith(pattern.prefix)) return `A SmartTag deve começar com ${pattern.prefix}. Confira o prefixo ou o número informado.`;
  return null;
}

export async function saveRegisteredTag(input: {
  farmId: string;
  tagNumber: string;
  animal: string;
  source: RegisteredTag['source'];
  correction?: { id: string; expectedUpdatedAt: string };
}) {
  const tagNumber = input.tagNumber.trim();
  const animal = input.animal.trim();
  if (!/^\d{1,30}$/.test(animal)) throw new Error('Informe o número do brinco com até 30 dígitos.');
  return db.transaction('rw', db.registrationFarms, db.registeredTags, async () => {
    const farm = await db.registrationFarms.get(input.farmId);
    if (!farm) throw new Error('Selecione a fazenda antes de cadastrar.');
    const previous = input.correction ? await db.registeredTags.get(input.correction.id) : undefined;
    if (input.correction) {
      if (!previous || previous.farmId !== input.farmId || previous.updatedAt !== input.correction.expectedUpdatedAt) {
        throw new Error('Este cadastro mudou. Abra a lista novamente antes de corrigir.');
      }
    }
    // A new manual pattern must not prevent fixing the animal on an older link.
    if (!previous || previous.tagNumber !== tagNumber) {
      const invalid = registrationTagError(tagNumber, input.source === 'manual' ? farm.manualTagPattern : undefined);
      if (invalid) throw new Error(invalid);
    }
    const existing = await db.registeredTags.where('[farmId+tagNumber]').equals([input.farmId, tagNumber]).first();
    if (existing && existing.id !== previous?.id) {
      throw new Error(`Esta tag já está cadastrada no animal ${existing.animal}. Para alterar, use Corrigir na lista.`);
    }
    const conflict = await db.registeredTags.where('[farmId+animal]').equals([input.farmId, animal]).first();
    if (conflict && conflict.id !== previous?.id) throw new Error(`O animal ${animal} já tem a tag ${conflict.tagNumber}. Confira o vínculo antes de continuar.`);
    const now = new Date(Math.max(Date.now(), previous ? Date.parse(previous.updatedAt) + 1 : 0)).toISOString();
    const record: RegisteredTag = {
      id: previous?.id ?? newId('registration'), farmId: input.farmId, tagNumber, animal,
      source: previous?.source ?? input.source, createdAt: previous?.createdAt ?? now, updatedAt: now,
      corrections: previous ? [...previous.corrections, { tagNumber: previous.tagNumber, animal: previous.animal, changedAt: now }] : []
    };
    await db.registeredTags.put(record);
    await db.registrationFarms.update(input.farmId, { updatedAt: now });
    return record;
  });
}
