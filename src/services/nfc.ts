import { isReaderSecureContext, throwIfReaderAborted, waitForReaderActivation } from './reader-access';

export interface NfcScanResult {
  tagNumber: string;
  rawValue: string;
}

export function isWebNfcSupported() {
  return isReaderSecureContext() && typeof window !== 'undefined' && 'NDEFReader' in window;
}

function normalizeTagValue(value: string) {
  const trimmed = value.trim();
  const digitsOnly = trimmed.replace(/[^0-9]/g, '');
  return digitsOnly || trimmed;
}

function decodeRecord(record: NDEFRecord) {
  try {
    if (record.recordType === 'text') {
      return new TextDecoder(record.encoding || 'utf-8').decode(record.data);
    }

    if (record.recordType === 'url' || record.recordType === 'absolute-url') {
      return new TextDecoder().decode(record.data);
    }

    return new TextDecoder().decode(record.data);
  } catch {
    return '';
  }
}

export async function startNfcReader(
  onRead: (result: NfcScanResult) => void,
  onReadError?: (message: string) => void,
  signal?: AbortSignal
) {
  if (!isReaderSecureContext()) throw new Error('Abra o BIPTAG pelo endereço HTTPS para permitir acesso ao NFC.');
  if (!isWebNfcSupported()) {
    throw new Error('Web NFC não está disponível neste navegador. Use Chrome no Android.');
  }

  throwIfReaderAborted(signal);
  const reader = new NDEFReader();
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });

  reader.addEventListener('reading', (event) => {
    if (controller.signal.aborted) return;
    const decoded = event.message.records
      .map(decodeRecord)
      .map((value) => value.trim())
      .filter(Boolean);

    const rawValue = decoded[0] ?? '';
    if (!rawValue) {
      onReadError?.('A tag respondeu, mas não trouxe conteúdo NDEF legível. O NFC do celular só lê números gravados em NDEF; use o bastão Bluetooth HHR5000SN ou digite o número.');
      return;
    }

    const tagNumber = normalizeTagValue(rawValue);
    if (/^0+$/.test(tagNumber)) {
      onReadError?.('A tag enviou somente zeros no conteúdo NDEF. Esse valor não é um número de SmartTag; confira a etiqueta e tente o bastão Bluetooth HHR5000SN ou digite o número.');
      return;
    }

    onRead({
      rawValue,
      tagNumber
    });
  });

  reader.addEventListener('readingerror', () => {
    if (controller.signal.aborted) return;
    onReadError?.('A tag foi detectada, mas houve erro na leitura. Aproxime novamente.');
  });

  try {
    await waitForReaderActivation(reader.scan({ signal: controller.signal }), controller.signal);
    return () => { signal?.removeEventListener('abort', abort); controller.abort(); };
  } catch (err) {
    signal?.removeEventListener('abort', abort);
    controller.abort();
    throw err;
  }
}
