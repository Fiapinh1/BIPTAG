export interface NfcScanResult {
  tagNumber: string;
  rawValue: string;
}

export function isWebNfcSupported() {
  return typeof window !== 'undefined' && 'NDEFReader' in window;
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
  onReadError?: (message: string) => void
) {
  if (!isWebNfcSupported()) {
    throw new Error('Web NFC não está disponível neste navegador. Use Chrome no Android.');
  }

  const reader = new NDEFReader();
  const controller = new AbortController();

  reader.addEventListener('reading', (event) => {
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
    onReadError?.('A tag foi detectada, mas houve erro na leitura. Aproxime novamente.');
  });

  await reader.scan({ signal: controller.signal });

  return () => controller.abort();
}
