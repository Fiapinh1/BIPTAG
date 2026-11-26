import { useEffect, useId, useRef, useState } from 'react';
import { BookOpenIcon, SettingsIcon } from '../icons/Icons';
import { QuickStartGuide } from './QuickStartGuide';

export function WaveHeader({ onHome, onSettings, online }: {
  onHome: () => void;
  onSettings: () => void;
  online: boolean;
}) {
  const id = useId().replace(/:/g, '');
  const [helpOpen, setHelpOpen] = useState(false);
  const help = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (helpOpen && !help.current?.open) help.current?.showModal();
    if (!helpOpen && help.current?.open) help.current.close();
  }, [helpOpen]);

  return <>
    <header className="topbar wave-header">
      <div className="wave-header__row">
        <button className="brand" onClick={onHome} aria-label="Início — todas as fazendas">
          <span className="brand__mark"><img src="/novas%20logos/logo-192x192.png" alt="BIPTAG" width="40" height="40" /></span>
          <span className="wave-header__identity"><strong className="wave-header__name">BIP<span className="wave-header__tag">TAG</span></strong><small>Gestão de SmartTags</small></span>
        </button>
        <div className="wave-header__actions">
          <button className="wave-header__help" onClick={() => setHelpOpen(true)} aria-label="Primeira vez no BIPTAG?" title="Primeira vez no BIPTAG?" aria-haspopup="dialog">
            <BookOpenIcon size={19} /><span>Primeira vez?</span>
          </button>
          <button className={`connection-pill connection-pill--settings ${online ? 'is-online' : 'is-offline'}`} onClick={onSettings} title="Configurações" aria-label="Abrir configurações"><SettingsIcon size={21} /></button>
        </div>
      </div>
      <svg className="wave-header__waves" viewBox="0 0 1440 80" width="1440" height="80" preserveAspectRatio="none" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id={`${id}-green`} x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#149900" /><stop offset="52%" stopColor="#25CC00" /><stop offset="100%" stopColor="#0B571E" /></linearGradient>
          <linearGradient id={`${id}-graphite`} x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#122022" /><stop offset="64%" stopColor="#122022" /><stop offset="100%" stopColor="#123324" /></linearGradient>
        </defs>
        <path d="M0 78 C180 12 330 60 510 40 C700 18 720 -6 900 2 C1110 10 1260 38 1440 76 L1440 0 L0 0 Z" fill={`url(#${id}-green)`} />
        <path d="M0 56 C180 -2 330 48 510 27 C700 4 735 -5 900 0 C1110 4 1260 24 1440 54 L1440 0 L0 0 Z" fill={`url(#${id}-graphite)`} />
      </svg>
    </header>
    <dialog ref={help} className="wave-header-guide" aria-labelledby="wave-header-guide-title" onCancel={() => setHelpOpen(false)} onClose={() => setHelpOpen(false)} onClick={(event) => { if (event.target === event.currentTarget) setHelpOpen(false); }}>
      <div className="wave-header-guide__heading"><div><span className="eyebrow">PARA COMEÇAR</span><h2 id="wave-header-guide-title">Primeira vez no BIPTAG?</h2></div><button className="app-modal__close" onClick={() => setHelpOpen(false)} aria-label="Fechar ajuda">×</button></div>
      <QuickStartGuide />
      <button className="button button--ghost button--full" onClick={() => setHelpOpen(false)}>Entendi, voltar ao app</button>
    </dialog>
  </>;
}
