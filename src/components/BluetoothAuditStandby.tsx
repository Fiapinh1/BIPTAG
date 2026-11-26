import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { HHR5000Status } from '../hooks/useHHR5000';
import { BluetoothIcon, CheckIcon, ChevronRightIcon, IssuesIcon, RefreshIcon } from '../icons/Icons';
import { bluetoothConnectionAlert, bluetoothReadingAlert, type BluetoothAlert } from '../presentation/bluetooth-feedback';
import { HHR5000Icon, type HHR5000IconState } from './HHR5000Icon';
import { ReaderHelp } from './ReaderHelp';

export function BluetoothConnectionNotice({ status, hasReadError, portalTarget }: { status: HHR5000Status; hasReadError: boolean; portalTarget?: Element | null }) {
  const previous = useRef(status);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (status === 'conectado' && previous.current !== 'conectado') {
      setVisible(true);
      timer = setTimeout(() => setVisible(false), 3000);
    } else if (status !== 'conectado') setVisible(false);
    previous.current = status;
    return () => clearTimeout(timer);
  }, [status]);
  if (!visible || status !== 'conectado' || hasReadError) return null;
  const notice = <div className="bluetooth-connection-notice" role="status"><CheckIcon size={24} /><div><strong>Bastão conectado!</strong><span>Pronto para iniciar a leitura.</span></div></div>;
  // Native dialogs occupy the top layer; keep the same timed notice visible there.
  return portalTarget ? createPortal(notice, portalTarget) : notice;
}

export function BluetoothAuditStandby({ status, supported, message, error, onActivate, onStop }: {
  status: HHR5000Status; supported: boolean; message: string; error?: string | null; onActivate: () => void; onStop: () => void;
}) {
  const connected = status === 'conectado';
  const connecting = status === 'conectando';
  const connectionAlert = bluetoothConnectionAlert(status, supported, message);
  const [persistentAlert, setPersistentAlert] = useState<BluetoothAlert | null>(null);
  useEffect(() => {
    if (status === 'conectado' || message.includes('desconectado por você')) setPersistentAlert(null);
    else if (status !== 'conectando') setPersistentAlert(bluetoothConnectionAlert(status, supported, message));
  }, [status, supported, message]);
  const alert = connectionAlert ?? (!connected ? persistentAlert : null) ?? (connected ? bluetoothReadingAlert(error) : null);
  const iconState: HHR5000IconState = connecting ? 'connecting' : connected ? 'waiting' : alert ? alert.tone === 'danger' ? 'error' : 'warning' : 'disconnected';
  return <div className={`audit-reader-standby audit-reader-standby--bluetooth ${connected ? 'is-ready' : ''}`} data-reader-state={iconState}>
    <span className="bluetooth-standby__icon"><HHR5000Icon size={60} state={iconState} />{connected && <svg className="bluetooth-standby__signal" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M5 5a14 14 0 0 1 14 14" /><path d="M5 11a8 8 0 0 1 8 8" /></svg>}</span>
    <span className="bluetooth-standby__status" role="status">{connected ? <CheckIcon size={14} /> : connecting ? <RefreshIcon size={14} /> : <BluetoothIcon size={14} />}{connected ? 'Bastão conectado' : connecting ? 'Conectando bastão…' : 'Bastão desconectado'}</span>
    <h2>{connected ? 'Leia a próxima tag' : connecting ? 'Conectando ao bastão' : 'Conecte seu bastão'}</h2>
    <p className="bluetooth-standby__caption">{connected ? 'Aguardando leitura do bastão...' : connecting ? 'Aguarde a conexão.' : 'Conecte o bastão para começar.'}</p>
    {alert && <div className={`bluetooth-standby__alert bluetooth-standby__alert--${alert.tone}`} role="alert"><IssuesIcon size={19} /><div><strong>{alert.title}</strong><span>{alert.message}</span></div></div>}
    {!connected && <button className="button button--primary" disabled={!supported || connecting} onClick={onActivate}>{connecting ? 'Conectando…' : 'Conectar bastão'}</button>}
    {connecting && <button className="button button--ghost" onClick={onStop}>Cancelar conexão</button>}
    {!connected && <ReaderHelp mode="bluetooth" technicalMessages={[...(alert ? [message] : []), ...(error ? [error] : [])]} />}
  </div>;
}

export function AuditConferenceHistory({ collapsible, children }: { collapsible: boolean; children: ReactNode }) {
  return collapsible ? <details className="bluetooth-conference-history"><summary>Últimas conferências<ChevronRightIcon size={17} /></summary>{children}</details> : <>{children}</>;
}
