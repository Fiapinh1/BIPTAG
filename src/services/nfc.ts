import { isReaderSecureContext } from './reader-access';

export interface NfcScanResult {
  tagNumber: string;
  rawValue: string;
}

export function isWebNfcSupported() {
  return isReaderSecureContext() && typeof window !== 'undefined' && typeof window.NDEFReader === 'function';
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

  signal?.throwIfAborted();
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
      onReadError?.('A tag foi detectada, mas nenhum conteúdo NDEF legível foi encontrado.');
      return;
    }

    onRead({
      rawValue,
      tagNumber: normalizeTagValue(rawValue)
    });
  });

  reader.addEventListener('readingerror', () => {
    if (controller.signal.aborted) return;
    onReadError?.('A tag foi detectada, mas houve erro na leitura. Aproxime novamente.');
  });

  try {
    await reader.scan({ signal: controller.signal });
    return () => { signal?.removeEventListener('abort', abort); controller.abort(); };
  } catch (err) {
    signal?.removeEventListener('abort', abort);
    controller.abort();
    throw err;
  }
}
