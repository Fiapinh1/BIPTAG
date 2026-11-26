import { useEffect, useState } from 'react';
import type { HHR5000Reader } from '../hooks/useHHR5000';
import { BluetoothIcon, SettingsIcon } from '../icons/Icons';
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
    <div><BluetoothIcon size={23} /><h2 id="reader-setup-title">Vai usar um leitor de tags?</h2></div>
    <p>Conecte seu bastão por Bluetooth ou abra Configurar leitores para testar o NFC do celular. Autorize o acesso se o navegador pedir. Você também pode configurar depois.</p>
    {reader.status === 'erro' && <p role="alert">{reader.message}</p>}
    <div className="reader-setup-notice__actions">
      <button className="button button--primary" disabled={!reader.isSupported || reader.status === 'conectando'} onClick={() => void reader.chooseDevice()}><BluetoothIcon size={19} />{reader.status === 'conectando' ? 'Aguardando autorização…' : 'Conectar bastão'}</button>
      <button className="button button--ghost" onClick={onSettings}><SettingsIcon size={19} />Configurar leitores</button>
      {reader.status === 'conectando' ? <button className="button button--ghost" onClick={reader.disconnect}>Cancelar conexão</button> : <button className="link-button" onClick={dismiss}>Agora não</button>}
    </div>
    {!reader.isSupported && <p>Este navegador não disponibilizou Bluetooth. Abra “Configurar leitores” e escolha “Leitores de tags” para verificar o acesso pelo Chrome.</p>}
  </section>;
}
