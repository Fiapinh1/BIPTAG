import type { MouseEvent } from 'react';
import { CheckIcon, IssuesIcon, RefreshIcon } from '../icons/Icons';
import { nfcFeedback, nfcTechnicalMessage } from '../presentation/nfc-feedback';
import { ContextHelp } from './ContextHelp';
import { NfcReaderIcon } from './NfcReaderIcon';
import { NfcReadDiagnostics } from './NfcReadDiagnostics';
import { ReaderHelpContent } from './ReaderHelp';

export function NfcAuditStandby({ active, connecting, supported, error, onActivate, onStop }: {
  active: boolean; connecting: boolean; supported: boolean; error?: string | null; onActivate: () => void; onStop: () => void;
}) {
  const alert = nfcFeedback(error, active);
  function control(event: MouseEvent<HTMLButtonElement>, action: () => void) {
    event.currentTarget.closest('dialog')?.close();
    action();
  }
  return <div className={`audit-reader-standby audit-reader-standby--phone ${active ? 'is-ready' : ''} ${connecting ? 'is-starting' : ''}`}>
    <div className="nfc-standby__help nfc-reader-help"><ContextHelp title="NFC do telefone">
      <ReaderHelpContent mode="phone" />
      {error && <p className="nfc-reader-help__technical">{nfcTechnicalMessage(error)}</p>}
      <div className="nfc-reader-help__controls">
        {active && <><button className="button button--ghost" onClick={event => control(event, onStop)}>Parar NFC</button><button className="button button--ghost" onClick={event => control(event, onActivate)}>Reiniciar NFC</button></>}
        {connecting && <button className="button button--ghost" onClick={event => control(event, onStop)}>Cancelar ativação do NFC</button>}
      </div>
      <NfcReadDiagnostics />
    </ContextHelp></div>
    <span className="nfc-standby__icon"><NfcReaderIcon size={72} /></span>
    <span className="nfc-standby__status" role="status">{active ? <CheckIcon size={14} /> : connecting ? <RefreshIcon size={14} /> : null}{active ? 'NFC ativo' : connecting ? 'Iniciando NFC…' : supported ? 'Pronto para ativar' : 'NFC indisponível'}</span>
    <h2>{active ? 'Aproxime a tag' : connecting ? 'Ativando leitor NFC' : 'NFC do telefone'}</h2>
    <p className="nfc-standby__caption">{active ? 'Encoste a tag na parte de trás do celular.' : connecting ? 'Aguarde a ativação.' : supported ? 'Ative o leitor para começar.' : 'Use Chrome no Android em HTTPS.'}</p>
    {alert && <div className="nfc-standby__alert" role="alert"><IssuesIcon size={19} /><div><strong>{alert.title}</strong><span>{alert.message}</span></div></div>}
    {!active && <button className="button button--primary button--full" disabled={!supported || connecting} onClick={onActivate}>{connecting ? 'Ativando NFC…' : 'Ativar NFC do telefone'}</button>}
    {connecting && <button className="button button--ghost" onClick={onStop}>Cancelar ativação do NFC</button>}
  </div>;
}
