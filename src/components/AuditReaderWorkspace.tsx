import { ChevronRightIcon, KeyboardIcon, PhoneIcon, StickReaderIcon } from '../icons/Icons';
import { ReaderHelp } from './ReaderHelp';
import { NfcReadDiagnostics } from './NfcReadDiagnostics';

export type AuditReadMode = 'choose' | 'manual' | 'bluetooth' | 'phone';

export function AuditReadModePicker({ onSelect }: { onSelect: (mode: AuditReadMode) => void }) {
  return (
    <div className="audit-mode-picker">
      <div className="audit-mode-picker__intro"><h2>Como você quer conferir?</h2><p>Escolha uma forma de ler as tags.</p></div>
      {[
        { mode: 'manual' as const, icon: <KeyboardIcon size={28} />, title: 'Digitar manualmente', text: 'Informe os dígitos finais da SmartTag.' },
        { mode: 'bluetooth' as const, icon: <StickReaderIcon size={28} />, title: 'Usar bastão Bluetooth', text: 'Leia as tags com o HHR5000SN.' },
        { mode: 'phone' as const, icon: <PhoneIcon size={28} />, title: 'Usar NFC do telefone', text: 'Aproxime uma tag compatível do celular.' }
      ].map((option) => (
        <button type="button" className="audit-mode-option" key={option.mode} onClick={() => onSelect(option.mode)}>
          <span className="audit-mode-option__icon">{option.icon}</span>
          <span><strong>{option.title}</strong><small>{option.text}</small></span>
          <ChevronRightIcon />
        </button>
      ))}
    </div>
  );
}

export function AuditReaderStandby({ mode, active, connecting, supported, message, error, onActivate, onStop }: {
  mode: 'bluetooth' | 'phone';
  active: boolean;
  connecting: boolean;
  supported: boolean;
  message: string;
  error?: string | null;
  onActivate: () => void;
  onStop: () => void;
}) {
  const phone = mode === 'phone';
  return (
    <div className={`audit-reader-standby ${active ? 'is-ready' : ''}`}>
      <span className="audit-reader-standby__icon">{phone ? <PhoneIcon size={42} /> : <StickReaderIcon size={42} />}</span>
      <span className="audit-reader-standby__status" role="status">{active ? 'Pronto para ler' : connecting ? phone ? 'Aguardando ativação do NFC…' : 'Conectando…' : supported ? 'Leitura desativada' : 'Indisponível neste acesso'}</span>
      <h2>{active ? phone ? 'Aproxime a tag' : 'Leia a próxima tag' : phone ? 'NFC do telefone' : 'Conecte seu bastão'}</h2>
      <p>{active ? phone ? 'Encoste uma tag compatível na parte de trás do celular.' : 'Use o bastão. A conferência abre assim que a tag for recebida.'
        : !supported ? phone ? 'Use o Chrome no Android em HTTPS, com NFC disponível no telefone.' : 'Abra o app em HTTPS no Chrome ou Edge com Bluetooth disponível.'
          : message}</p>
      {error && <div className="alert alert--danger" role="alert">{error}</div>}
      {!active && <button className="button button--primary button--full" disabled={!supported || connecting} onClick={onActivate}>{connecting ? 'Conectando…' : phone ? 'Ativar NFC do telefone' : 'Conectar bastão'}</button>}
      {connecting && phone && <p className="audit-reader-standby__permission">Se o Chrome mostrar uma permissão, toque em Permitir. Confira se o NFC está ligado nas configurações do celular.</p>}
      {connecting && <button className="button button--ghost" onClick={onStop}>{phone ? 'Cancelar ativação do NFC' : 'Cancelar conexão'}</button>}
      {active && phone && <button className="button button--ghost" onClick={onStop}>Parar NFC</button>}
      {active && <button className="button button--ghost" onClick={onActivate}>{phone ? 'Reiniciar NFC' : 'Reconectar bastão'}</button>}
      {phone && <small className="audit-reader-standby__compatibility">O telefone lê tags NFC com conteúdo NDEF. Para tags que exigem o bastão, escolha Bluetooth.</small>}
      <ReaderHelp mode={mode} />
      {phone && <NfcReadDiagnostics />}
    </div>
  );
}
