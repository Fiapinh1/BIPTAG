import { describe, expect, it } from 'vitest';
import { nfcFeedback, nfcTechnicalMessage } from '../src/presentation/nfc-feedback';
import { describeReaderError } from '../src/services/reader-access';

describe('NFC feedback presentation', () => {
  it('does not invent an alert when no read or activation error exists', () => {
    expect(nfcFeedback(null, true)).toBeNull();
    expect(nfcFeedback(undefined, false)).toBeNull();
  });
  it('distinguishes a blocked permission from unavailable hardware', () => {
    const denied = describeReaderError(new DOMException('Denied', 'NotAllowedError'), 'nfc').message;
    const unavailable = describeReaderError(new DOMException('No adapter', 'NotSupportedError'), 'nfc').message;
    expect(nfcFeedback(denied, false)?.title).toBe('Permissão necessária');
    expect(nfcFeedback(unavailable, false)?.title).toBe('NFC indisponível');
    expect(nfcFeedback(unavailable, false)?.message).not.toContain('desativado');
  });
  it('retains HTTPS guidance when that is the actual error', () => {
    expect(nfcFeedback('Abra o BIPTAG pelo endereço HTTPS para permitir acesso ao NFC.', false)?.title).toBe('Acesso seguro necessário');
  });
  it('presents a rejected all-zero value without treating the reader as disconnected', () => {
    expect(nfcFeedback('A tag enviou somente zeros no conteúdo NDEF.', true)).toEqual({ title: 'Tag inválida', message: 'Nenhuma tag registrada. Tente novamente.' });
  });
  it('keeps conflicting tag contents distinct from a failed activation', () => {
    expect(nfcFeedback('A tag contém mais de um número possível. Nada foi registrado.', true)?.title).toBe('Mais de um número na tag');
    expect(nfcFeedback('Não foi possível iniciar o NFC.', false)?.title).toBe('Não foi possível ativar');
    expect(nfcFeedback('A tag foi detectada, mas o navegador não conseguiu ler o conteúdo NDEF.', true)?.title).toBe('Leitura não reconhecida');
  });
  it.each([
    'A tag respondeu, mas não trouxe conteúdo NDEF legível. O NFC do celular só lê números gravados em NDEF; use o bastão Bluetooth HHR5000SN ou digite o número.',
    'A tag enviou somente zeros no conteúdo NDEF. Esse valor não é um número de SmartTag; confira a etiqueta e tente o bastão Bluetooth HHR5000SN ou digite o número.'
  ])('keeps NFC details while omitting instructions for a different reader', (original) => {
    expect(nfcTechnicalMessage(original)).toContain('NDEF');
    expect(nfcTechnicalMessage(original)).not.toMatch(/bastão|Bluetooth|HHR5000/);
    expect(original).toContain('Bluetooth');
  });
});
