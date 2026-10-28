import { isReaderSecureContext, throwIfReaderAborted, waitForReaderActivation } from './reader-access';
import { clearNfcDiagnostics, recordNfcDiagnostic } from './nfc-diagnostics';

export interface NfcScanResult {
  tagNumber: string;
  rawValue: string;
}

export function isWebNfcSupported() {
  return isReaderSecureContext() && typeof window !== 'undefined' && 'NDEFReader' in window;
}

function tagCandidates(value: string) {
  const trimmed = value.trim();
  if (/^[0-9\s-]+$/.test(trimmed)) return [trimmed.replace(/[^0-9]/g, '')];
  return trimmed.match(/[0-9]+/g) ?? [];
}

function decodeRecord(record: NDEFRecord) {
  try {
    if (record.recordType === 'text') {
      // Web NFC already removes the NDEF status/language header. Decode only
      // record.data, never the physical UID or a numeric conversion of raw bytes.
      return new TextDecoder(record.encoding || 'utf-8', { fatal: true }).decode(record.data);
    }

    if (record.recordType === 'url' || record.recordType === 'absolute-url') {
      return new TextDecoder('utf-8', { fatal: true }).decode(record.data);
    }

    return new TextDecoder('utf-8', { fatal: true }).decode(record.data);
  } catch {
    return '';
  }
}

export async function startNfcReader(
  onRead: (result: NfcScanResult) => void,
  onReadError?: (message: string) => void,
  signal?: AbortSignal,
  getExpectedTagLength: () => number = () => 15
) {
  if (!isReaderSecureContext()) throw new Error('Abra o BIPTAG pelo endereço HTTPS para permitir acesso ao NFC.');
  if (!isWebNfcSupported()) {
    throw new Error('Web NFC não está disponível neste navegador. Use Chrome no Android.');
  }

  throwIfReaderAborted(signal);
  clearNfcDiagnostics();
  const reader = new NDEFReader();
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });

  reader.addEventListener('reading', (event) => {
    if (controller.signal.aborted) return;
    const records = event.message.records;
    recordNfcDiagnostic({ at: new Date().toISOString(), event: 'reading', records: records.slice(0, 8).map((record) => {
      const bytes = record.data ? new Uint8Array(record.data.buffer, record.data.byteOffset, record.data.byteLength).slice(0, 96) : new Uint8Array();
      return { type: record.recordType, encoding: record.encoding, language: record.lang, byteLength: record.data?.byteLength ?? 0,
        hex: Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0').toUpperCase()).join(' '), text: decodeRecord(record).slice(0, 128) };
    }) });
    const decoded = records
      .filter((record) => !['empty', 'smart-poster'].includes(record.recordType))
      .map(decodeRecord)
      .map((value) => value.trim())
      .filter(Boolean);

    if (!decoded.length) {
      onReadError?.('A tag respondeu, mas não trouxe conteúdo NDEF legível. O NFC do celular só lê números gravados em NDEF; use o bastão Bluetooth HHR5000SN ou digite o número.');
      return;
    }

    const candidates = decoded.flatMap((rawValue) => tagCandidates(rawValue).map((tagNumber) => ({ tagNumber, rawValue })));
    // A tag may contain metadata before its number. Prefer complete identifiers,
    // but refuse conflicting IDs instead of joining records or silently picking one.
    const complete = candidates.filter((candidate) => candidate.tagNumber.length === getExpectedTagLength() && !/^0+$/.test(candidate.tagNumber));
    const possible = complete.length ? complete : candidates;
    const unique = new Map(possible.map((candidate) => [candidate.tagNumber, candidate]));
    if (unique.size !== 1) {
      onReadError?.(unique.size > 1 ? 'A tag contém mais de um número possível. Nada foi registrado. Confira o conteúdo NDEF antes de repetir a leitura.'
        : 'O conteúdo NFC foi recebido, mas não contém um número de SmartTag legível. Confira Dados recebidos pelo NFC.');
      return;
    }
    const { tagNumber, rawValue } = [...unique.values()][0];
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
    recordNfcDiagnostic({ at: new Date().toISOString(), event: 'readingerror' });
    onReadError?.('A tag foi detectada, mas o navegador não conseguiu ler o conteúdo NDEF. Aproxime novamente. Se continuar, consulte Dados recebidos pelo NFC.');
  });

  try {
    await waitForReaderActivation(reader.scan({ signal: controller.signal }), controller.signal);
    if (!controller.signal.aborted) recordNfcDiagnostic({ at: new Date().toISOString(), event: 'started' });
    return () => { signal?.removeEventListener('abort', abort); controller.abort(); };
  } catch (err) {
    signal?.removeEventListener('abort', abort);
    controller.abort();
    throw err;
  }
}
