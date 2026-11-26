import { describe, expect, it } from 'vitest';
import { bluetoothConnectionAlert, bluetoothReadingAlert } from '../src/presentation/bluetooth-feedback';
import { describeReaderError } from '../src/services/reader-access';

describe('Bluetooth feedback presentation', () => {
  it('does not confuse missing browser support with a powered-off radio', () => {
    expect(bluetoothConnectionAlert('erro', false, '')?.title).toBe('Bluetooth indisponível');
    const unavailable = describeReaderError(new DOMException('No adapter', 'NotSupportedError'), 'bluetooth', true);
    expect(bluetoothConnectionAlert('erro', true, unavailable.message)?.title).toBe('Bluetooth indisponível');
    expect(bluetoothConnectionAlert('erro', true, 'Bluetooth desativado')?.title).toBe('Bluetooth desativado');
  });

  it.each(['NotAllowedError', 'SecurityError'])('presents permission guidance for %s without inventing a connection loss', (name) => {
    const problem = describeReaderError(new DOMException('Denied', name), 'bluetooth', true);
    expect(bluetoothConnectionAlert('erro', true, problem.message)).toMatchObject({ title: 'Permissão necessária', reconnect: false });
  });

  it('distinguishes cancelling the picker, selecting an incompatible reader and losing a connection', () => {
    const error = new DOMException('Not found', 'NotFoundError');
    expect(bluetoothConnectionAlert('erro', true, describeReaderError(error, 'bluetooth').message)?.title).toBe('Bastão não selecionado');
    expect(bluetoothConnectionAlert('erro', true, describeReaderError(error, 'bluetooth', true).message)?.title).toBe('Leitor indisponível');
    expect(bluetoothConnectionAlert('desconectado', true, 'Bastão desconectado. Tentando reconectar…')).toMatchObject({ title: 'Bastão desconectado', reconnect: true });
    expect(bluetoothConnectionAlert('desconectado', true, 'Bastão desconectado por você. Toque em conectar para voltar.')).toBeNull();
  });

  it('keeps connection failures distinct from read errors', () => {
    const problem = describeReaderError(new DOMException('Disconnected', 'NetworkError'), 'bluetooth', true);
    expect(bluetoothConnectionAlert('desconectado', true, problem.message)).toMatchObject({ title: 'Falha na conexão', reconnect: true, tone: 'danger' });
    expect(bluetoothReadingAlert('O bastão enviou somente zeros, sem um número de tag válido. Nada foi registrado.')).toMatchObject({ title: 'Tag inválida', message: 'Nenhuma tag registrada. Tente ler novamente.' });
    expect(bluetoothReadingAlert('Leitura incompleta')?.title).toBe('Leitura não reconhecida');
    expect(bluetoothReadingAlert(null)).toBeNull();
  });

  it('does not show stale connection messages after a confirmed connection or while connecting', () => {
    expect(bluetoothConnectionAlert('conectado', true, 'Bastão desconectado. Tentando reconectar…')).toBeNull();
    expect(bluetoothConnectionAlert('conectando', true, 'Selecione seu bastão…')).toBeNull();
    expect(bluetoothConnectionAlert('desconectado', true, '')).toBeNull();
  });
});
