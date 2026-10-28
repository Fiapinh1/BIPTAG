import { useEffect, useState } from 'react';
import type { HHR5000Reader } from '../hooks/useHHR5000';
import { BluetoothIcon } from '../icons/Icons';
import { getReaderEnvironment } from '../services/reader-environment';

const STORAGE_KEY = 'biptag-reader-setup-seen-v1';

export function ReaderSetupNotice({ reader, onSettings }: { reader: HHR5000Reader; onSettings: () => void }) {
  const [visible, setVisible] = useState(() => {
    if (!getReaderEnvironment().android) return false;
    try { return localStorage.getItem(STORAGE_KEY) !== '1'; } catch { return true; }
  });
  function dismiss() {
    setVisible(false);
    try { localStorage.setItem(STORAGE_KEY, '1'); } catch { /* Dismiss for this opening. */ }
  }
  useEffect(() => { if (reader.status === 'conectado') dismiss(); }, [reader.status]);
  if (!visible || reader.status === 'conectado') return null;
  return <section className="reader-setup-notice" aria-labelledby="reader-setup-title">
    <div><BluetoothIcon size={23} /><h2 id="reader-setup-title">Prepare os leitores neste celular</h2></div>
    <p>Toque para autorizar o bastão. O Android e o navegador mostram as permissões necessárias; depois tentaremos reconectar ao mesmo bastão automaticamente.</p>
    {reader.status === 'erro' && <p role="alert">{reader.message}</p>}
    <div className="reader-setup-notice__actions">
      <button className="button button--primary" disabled={!reader.isSupported || reader.status === 'conectando'} onClick={() => void reader.chooseDevice()}>{reader.status === 'conectando' ? 'Aguardando autorização…' : 'Autorizar bastão'}</button>
      <button className="button button--ghost" onClick={onSettings}>NFC e permissões</button>
      {reader.status === 'conectando' ? <button className="button button--ghost" onClick={reader.disconnect}>Cancelar conexão</button> : <button className="link-button" onClick={dismiss}>Agora não</button>}
    </div>
    {!reader.isSupported && <p>Este navegador não disponibilizou Bluetooth. Abra “NFC e permissões” para verificar o acesso pelo Chrome.</p>}
  </section>;
}
