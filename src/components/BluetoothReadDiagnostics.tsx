import { useState } from 'react';
import type { HHR5000Reader } from '../hooks/useHHR5000';
import { HHR5000_PRIMARY_CHARACTERISTIC_UUID } from '../services/hhr5000';

export function bluetoothDiagnosticText(reader: HHR5000Reader) {
  return [
    'BIPTAG — diagnóstico Bluetooth',
    `Versão carregada: ${import.meta.env.VITE_BIPTAG_BUILD ?? 'desenvolvimento'}`,
    `Navegador: ${navigator.userAgent}`,
    `Bastão: ${reader.deviceName ?? 'não selecionado'} — ${reader.status}`,
    `Canal de leitura: ${HHR5000_PRIMARY_CHARACTERISTIC_UUID}`,
    ...(reader.readError ? [`Aviso: ${reader.readError}`] : []),
    ...reader.diagnostics.map((entry) => [
      `${entry.at} | ${entry.event}${entry.reason ? ` (${entry.reason})` : ''} | ${entry.byteLength} bytes | esperado: ${entry.expectedLength} dígitos`,
      `Texto: ${JSON.stringify(entry.text)}`, `HEX: ${entry.hex}`
    ].join('\n')),
    ...(!reader.diagnostics.length ? ['Nenhum dado recebido nesta conexão.'] : [])
  ].join('\n');
}

export function BluetoothReadDiagnostics({ reader }: { reader: HHR5000Reader }) {
  const [copyMessage, setCopyMessage] = useState('');
  async function copy() {
    try {
      await navigator.clipboard.writeText(bluetoothDiagnosticText(reader));
      setCopyMessage('Diagnóstico do bastão copiado.');
    } catch { setCopyMessage('Não foi possível copiar. Você pode enviar um print dos dados abaixo.'); }
  }
  return <details className="reader-permissions__diagnostic reader-bluetooth-diagnostic">
    <summary>Dados recebidos do bastão</summary>
    <p>Últimas transmissões desta conexão, apenas neste celular. O diagnóstico inclui os números recebidos do bastão.</p>
    <pre>{bluetoothDiagnosticText(reader)}</pre>
    <button className="button button--ghost button--full" onClick={() => void copy()}>Copiar diagnóstico do bastão</button>
    {copyMessage && <p role="status">{copyMessage}</p>}
  </details>;
}
