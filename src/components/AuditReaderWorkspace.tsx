import { ChevronRightIcon, KeyboardIcon, StickReaderIcon } from '../icons/Icons';
import type { HHR5000Status } from '../hooks/useHHR5000';
import { BluetoothAuditStandby } from './BluetoothAuditStandby';
import { NfcAuditStandby } from './NfcAuditStandby';
import { NfcReaderIcon } from './NfcReaderIcon';

export type AuditReadMode = 'choose' | 'manual' | 'bluetooth' | 'phone';

export function AuditReadModePicker({ onSelect }: { onSelect: (mode: AuditReadMode) => void }) {
  return (
    <div className="audit-mode-picker" role="group" aria-labelledby="audit-read-mode-title">
      <div className="audit-mode-picker__intro"><h2 id="audit-read-mode-title">Como você quer conferir?</h2><p>Escolha uma forma de ler as tags.</p></div>
      {[
        { mode: 'manual' as const, icon: <KeyboardIcon size={28} />, title: 'Digitar manualmente', text: 'Informe os dígitos finais da SmartTag.' },
        { mode: 'bluetooth' as const, icon: <StickReaderIcon size={28} />, title: 'Usar bastão Bluetooth', text: 'Leia as tags com o HHR5000SN.' },
        { mode: 'phone' as const, icon: <NfcReaderIcon size={32} />, title: 'Usar NFC do telefone', text: 'Aproxime uma tag compatível do celular.' }
      ].map((option) => (
        <button type="button" className={`audit-mode-option audit-mode-option--${option.mode}`} key={option.mode} onClick={() => onSelect(option.mode)}>
          <span className="audit-mode-option__icon">{option.icon}</span>
          <span className="audit-mode-option__copy"><strong>{option.title}</strong><small>{option.text}</small></span>
          <ChevronRightIcon />
        </button>
      ))}
    </div>
  );
}

export function AuditReaderStandby({ mode, active, connecting, supported, message, error, onActivate, onStop, bluetoothStatus }: {
  mode: 'bluetooth' | 'phone';
  active: boolean;
  connecting: boolean;
  supported: boolean;
  message: string;
  error?: string | null;
  onActivate: () => void;
  onStop: () => void;
  bluetoothStatus?: HHR5000Status;
}) {
  if (mode === 'bluetooth') return <BluetoothAuditStandby status={bluetoothStatus ?? (active ? 'conectado' : connecting ? 'conectando' : 'desconectado')} supported={supported} message={message} error={error} onActivate={onActivate} onStop={onStop} />;
  return <NfcAuditStandby active={active} connecting={connecting} supported={supported} error={error} onActivate={onActivate} onStop={onStop} />;
}
