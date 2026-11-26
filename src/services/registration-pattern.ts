import { db } from '../db/db';
import type { SmartTagPattern } from '../types/domain';

export const DEFAULT_MANUAL_PATTERN: SmartTagPattern = { prefix: '', length: 15, numericOnly: true };

export function manualPatternError(pattern: SmartTagPattern) {
  if (!Number.isInteger(pattern.length) || pattern.length < 1 || pattern.length > 30) return 'O total deve ter de 1 a 30 dígitos.';
  if (!/^\d*$/.test(pattern.prefix)) return 'Use somente números no prefixo.';
  if (pattern.prefix.length >= pattern.length) return 'O total de dígitos deve ser maior que o prefixo.';
  return null;
}

export function parseManualRegistrationTag(value: string, pattern: SmartTagPattern) {
  if (value && !/^[\d\s-]+$/.test(value)) throw new Error('Digite ou cole somente o número da SmartTag.');
  const digits = value.replace(/[^0-9]/g, '');
  if (!digits) return '';
  if (digits.length === pattern.length) {
    if (!digits.startsWith(pattern.prefix)) throw new Error(`A tag deve começar com ${pattern.prefix}. Confira o número completo.`);
    return digits;
  }
  const remaining = pattern.length - pattern.prefix.length;
  if (digits.length > remaining) throw new Error(`Informe até ${remaining} dígitos finais ou cole a tag completa com ${pattern.length} dígitos. Nada foi cortado.`);
  return pattern.prefix + digits;
}

export async function saveRegistrationPattern(farmId: string, pattern: SmartTagPattern) {
  const error = manualPatternError(pattern);
  if (error) throw new Error(error);
  return db.transaction('rw', db.registrationFarms, async () => {
    if (!await db.registrationFarms.get(farmId)) throw new Error('Selecione a fazenda antes de configurar o padrão.');
    await db.registrationFarms.update(farmId, { manualTagPattern: { ...pattern, numericOnly: true }, updatedAt: new Date().toISOString() });
  });
}
