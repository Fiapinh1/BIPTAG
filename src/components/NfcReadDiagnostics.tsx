import { useState, useSyncExternalStore } from 'react';
import { getNfcDiagnostics, nfcDiagnosticText, subscribeNfcDiagnostics } from '../services/nfc-diagnostics';

export function NfcReadDiagnostics() {
  useSyncExternalStore(subscribeNfcDiagnostics, getNfcDiagnostics);
  const [message, setMessage] = useState('');
  async function copy() {
    try { await navigator.clipboard.writeText(nfcDiagnosticText()); setMessage('Diagnóstico NFC copiado.'); }
    catch { setMessage('Não foi possível copiar. Você pode enviar um print dos dados abaixo.'); }
  }
  return <details className="reader-permissions__diagnostic reader-bluetooth-diagnostic">
    <summary>Dados recebidos pelo NFC</summary>
    <p>Eventos e conteúdo recebidos nesta sessão, apenas neste celular. O diagnóstico inclui os números lidos.</p>
    <pre>{nfcDiagnosticText()}</pre>
    <button className="button button--ghost" onClick={() => void copy()}>Copiar diagnóstico NFC</button>
    {message && <p role="status">{message}</p>}
  </details>;
}
