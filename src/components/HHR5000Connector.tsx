import { useEffect, useRef } from 'react';
import { BluetoothIcon } from '../icons/Icons';
import type { HHR5000Reader } from '../hooks/useHHR5000';
import { ReaderHelp } from './ReaderHelp';

const statusLabel = {
  desconectado: 'Desconectado',
  conectando: 'Conectando',
  conectado: 'Conectado',
  erro: 'Erro'
};

export function HHR5000Connector({
  reader, open, onOpenChange
}: { reader: HHR5000Reader; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { status, message, lastTagRead, isSupported, deviceName } = reader;
  const dialogRef = useRef<HTMLDialogElement>(null);
  const connected = status === 'conectado';
  const connecting = status === 'conectando';

  useEffect(() => {
    if (open && !dialogRef.current?.open) dialogRef.current?.showModal();
    if (!open && dialogRef.current?.open) dialogRef.current?.close();
  }, [open]);

  return (
    <>
      <button type="button" className={`reader-indicator reader-indicator--${status}`} aria-label={`Bastão: ${statusLabel[status]}. Abrir conexão`} title={`Bastão ${statusLabel[status].toLowerCase()}`} aria-haspopup="dialog" onClick={() => onOpenChange(true)}>
        <BluetoothIcon size={22} /><span className="reader-indicator__dot" />
      </button>
      <dialog ref={dialogRef} className="reader-settings" aria-labelledby="reader-settings-title" onCancel={() => onOpenChange(false)} onClose={() => onOpenChange(false)} onClick={(event) => { if (event.target === event.currentTarget) onOpenChange(false); }}>
        <div className="reader-settings__content">
          <div className="reader-settings__heading">
            <div><span className="eyebrow">BLUETOOTH</span><h2 id="reader-settings-title">Seu bastão</h2></div>
            <button className="app-modal__close" onClick={() => onOpenChange(false)} aria-label="Fechar conexão do bastão">×</button>
          </div>
          <div className={`reader-settings__status reader-settings__status--${status}`} role="status"><BluetoothIcon /><strong>{statusLabel[status]}</strong></div>
          {deviceName && <strong>{deviceName}</strong>}
          <p>{isSupported ? message : 'Bluetooth indisponível neste acesso. Abra o app em HTTPS no Chrome ou Edge compatível.'}</p>
          <ReaderHelp mode="bluetooth" />
          {lastTagRead && <div className="reader-settings__last"><span>Última tag recebida</span><strong>{lastTagRead}</strong></div>}
          {!connected ? (
            <button className="button button--primary button--full" onClick={() => void reader.connect()} disabled={!isSupported || connecting}>{connecting ? 'Conectando…' : 'Conectar bastão'}</button>
          ) : <button className="button button--ghost button--full" onClick={reader.disconnect}>Desconectar bastão</button>}
          {connecting && <button className="button button--ghost button--full" onClick={reader.disconnect}>Cancelar conexão</button>}
          <button className="button button--ghost button--full" disabled={!isSupported || connecting} onClick={() => void reader.chooseDevice()}>Escolher outro bastão</button>
          <small>Após conectar, tentaremos reencontrar o mesmo bastão automaticamente com o app aberto. Ao tocar em desconectar, as tentativas param.</small>
        </div>
      </dialog>
    </>
  );
}
