import { describe, expect, it } from 'vitest';
import { describeReaderError } from '../src/services/reader-access';

describe('Reader permission guidance', () => {
  it.each(['NotAllowedError', 'SecurityError'])('stops automatic Bluetooth retries after %s', (name) => {
    const problem = describeReaderError(new DOMException('Denied', name), 'bluetooth', true);
    expect(problem.retryable).toBe(false);
    expect(problem.message).toContain('Dispositivos próximos');
    expect(problem.message).toContain('permissões deste site');
  });

  it('keeps reconnection available after a temporary network loss', () => {
    expect(describeReaderError(new DOMException('Disconnected', 'NetworkError'), 'bluetooth', true).retryable).toBe(true);
  });

  it('distinguishes cancelling selection from a missing GATT service on an already selected reader', () => {
    const error = new DOMException('Not found', 'NotFoundError');
    expect(describeReaderError(error, 'bluetooth').message).toContain('Nenhum bastão selecionado');
    const selected = describeReaderError(error, 'bluetooth', true);
    expect(selected.message).toContain('serviço de leitura');
    expect(selected.retryable).toBe(false);
  });

  it('gives NFC site-permission instructions after a denied request', () => {
    const problem = describeReaderError(new DOMException('Denied', 'NotAllowedError'), 'nfc');
    expect(problem.message).toContain('permita NFC');
    expect(problem.message).not.toContain('Dispositivos próximos');
  });

  it('does not claim the NFC hardware is available just because the API is exposed', () => {
    expect(describeReaderError(new DOMException('No adapter', 'NotSupportedError'), 'nfc').message).toContain('não disponibilizou um leitor NFC');
  });
});
