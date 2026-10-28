export interface NfcDiagnostic {
  at: string;
  event: 'started' | 'reading' | 'readingerror';
  records?: Array<{ type: string; encoding?: string; language?: string; byteLength: number; hex: string; text: string }>;
}
let entries: NfcDiagnostic[] = [];
const listeners = new Set<() => void>();
export const getNfcDiagnostics = () => entries;
export function subscribeNfcDiagnostics(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
export function clearNfcDiagnostics() { entries = []; listeners.forEach((listener) => listener()); }
export function recordNfcDiagnostic(entry: NfcDiagnostic) { entries = [...entries.slice(-7), entry]; listeners.forEach((listener) => listener()); }

export function nfcDiagnosticText() {
  return [
    'BIPTAG — diagnóstico NFC',
    `Versão carregada: ${import.meta.env.VITE_BIPTAG_BUILD ?? 'desenvolvimento'}`,
    `Navegador: ${navigator.userAgent}`,
    ...entries.flatMap((entry) => [`${entry.at} | ${entry.event}`, ...(entry.records ?? []).map((record) => [
      `Registro: ${record.type} | ${record.byteLength} bytes | ${record.encoding ?? '-'} | idioma: ${record.language ?? '-'}`,
      `Texto: ${JSON.stringify(record.text)}`, `HEX: ${record.hex}`
    ].join('\n'))]),
    ...(!entries.length ? ['Nenhum evento NFC recebido nesta sessão.'] : [])
  ].join('\n');
}
