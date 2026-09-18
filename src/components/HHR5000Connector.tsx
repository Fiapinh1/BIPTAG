import { ScanIcon, TagIcon } from '../icons/Icons';
import type { HHR5000Status } from '../hooks/useHHR5000';

type HHR5000ConnectorProps = {
  status: HHR5000Status;
  message: string;
  lastTagRead: string | null;
  isSupported: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
};

const statusLabel = {
  desconectado: 'Desconectado',
  conectando: 'Conectando',
  conectado: 'Conectado',
  erro: 'Erro'
};

export function HHR5000Connector({
  status,
  message,
  lastTagRead,
  isSupported,
  onConnect,
  onDisconnect
}: HHR5000ConnectorProps) {
  const connected = status === 'conectado';
  const connecting = status === 'conectando';

  return (
    <div className={`hhr5000-connector hhr5000-connector--${status}`}>
      <div className="hhr5000-connector__head">
        <div className="hhr5000-connector__icon"><ScanIcon size={20} /></div>
        <div>
          <span className="eyebrow">HHR5000SN</span>
          <strong>Leitor BLE</strong>
        </div>
        <span className="hhr5000-connector__status">{statusLabel[status]}</span>
      </div>

      <div className="hhr5000-connector__last">
        <TagIcon size={18} />
        <span>Ultima Tag Lida</span>
        <strong>{lastTagRead ?? '-'}</strong>
      </div>

      <p>{message}</p>

      <div className="hhr5000-connector__actions">
        {!connected ? (
          <button className="button button--secondary button--full" onClick={onConnect} disabled={!isSupported || connecting}>
            Conectar HHR5000SN
          </button>
        ) : (
          <button className="button button--ghost button--full" onClick={onDisconnect}>
            Desconectar
          </button>
        )}
      </div>
    </div>
  );
}
