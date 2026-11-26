import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { ArrowLeftIcon, BookOpenIcon, ChevronRightIcon, CloudIcon, DownloadIcon, HomeIcon, ScanIcon, UserIcon } from '../icons/Icons';
import { getInstallState, subscribeInstallState } from '../services/app-install';
import { scrollPageToTop } from '../services/page-scroll';
import { QuickStartGuide } from './QuickStartGuide';

type Section = 'readers' | 'account' | 'app' | 'guide';
const sections = {
  readers: { title: 'Leitores de tags', description: 'Conectar o bastão ou testar o NFC do celular.', icon: ScanIcon },
  account: { title: 'Conta e auditorias', description: 'Entrar na conta e usar auditorias em outros aparelhos.', icon: UserIcon },
  app: { title: 'Instalar e atualizar', description: 'Colocar na tela inicial e manter o aplicativo atualizado.', icon: DownloadIcon },
  guide: { title: 'Como usar o BIPTAG', description: 'Passo a passo para cadastrar tags ou fazer uma auditoria.', icon: BookOpenIcon }
};

export function SettingsWorkspace({ readerConnected, accountEmail, accountConnected, readers, account, app, onBack, onHome, backHint }: {
  readerConnected: boolean;
  accountEmail?: string;
  accountConnected: boolean;
  readers: ReactNode;
  account: ReactNode;
  app: ReactNode;
  onBack?: () => void;
  onHome: () => void;
  backHint: string;
}) {
  const [section, setSection] = useState<Section | null>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const lastSection = useRef<Section | null>(null);
  const menu = useRef<HTMLElement>(null);
  const install = useSyncExternalStore(subscribeInstallState, getInstallState);
  useEffect(() => {
    scrollPageToTop();
    if (section) title.current?.focus({ preventScroll: true });
    else if (lastSection.current) menu.current?.querySelector<HTMLButtonElement>(`[data-section="${lastSection.current}"]`)?.focus({ preventScroll: true });
    lastSection.current = section;
  }, [section]);
  const selected = section ? sections[section] : null;

  return <section className="settings-workspace">
    <header className="settings-workspace__header">
      <div className="settings-workspace__navigation">
        {section ? <button onClick={() => setSection(null)}><ArrowLeftIcon size={19} /><span>Configurações</span></button>
          : onBack ? <button onClick={onBack}><ArrowLeftIcon size={19} /><span>Voltar</span><small>{backHint}</small></button> : <span />}
        <button onClick={onHome}><HomeIcon size={19} /><span>Início</span></button>
      </div>
    </header>
    <div className="settings-workspace__title"><span className="eyebrow">{section ? 'CONFIGURAÇÕES' : 'DO SEU JEITO'}</span><h1 ref={title} tabIndex={-1}>{selected?.title ?? 'Configurações'}</h1><p>{selected?.description ?? 'Escolha o que você quer ajustar.'}</p></div>

    <div className="settings-workspace__menu" hidden={section !== null}>
      <nav ref={menu} aria-label="Opções de configuração">{(Object.keys(sections) as Section[]).map((key) => {
        const item = sections[key]; const Icon = item.icon;
        const status = key === 'readers' ? readerConnected ? 'Bastão conectado' : 'Bluetooth e NFC'
          : key === 'account' ? accountConnected ? 'Conta conectada' : 'Conta opcional'
            : key === 'app' ? install.installed ? 'Instalado neste aparelho' : 'Acesso pela tela inicial' : 'Para começar';
        return <button className="settings-menu-option" key={key} data-section={key} onClick={() => setSection(key)} aria-label={item.title} aria-describedby={`settings-${key}-description`}>
          <span className={`experience-icon experience-icon--${key}`}><Icon size={25} /></span>
          <span className="settings-menu-option__copy"><strong>{item.title}</strong><small id={`settings-${key}-description`}>{item.description}</small><span className={`settings-menu-option__status ${((key === 'readers' && readerConnected) || (key === 'account' && accountConnected)) ? 'is-connected' : ''}`}>{status}</span></span>
          <ChevronRightIcon size={19} />
        </button>;
      })}</nav>
      <p className="settings-workspace__note"><CloudIcon size={19} /><span>{accountConnected ? `Conta: ${accountEmail ?? 'conectada'}.` : 'Você pode cadastrar e conferir tags sem entrar em uma conta.'} A conta permite compartilhar as auditorias entre aparelhos.</span></p>
    </div>

    {/* Keep the existing panels mounted while navigating so reader tests and forms keep their state. */}
    <div className="settings-workspace__panel" hidden={section !== 'readers'}>{readers}</div>
    <div className="settings-workspace__panel" hidden={section !== 'account'}>{account}</div>
    <div className="settings-workspace__panel" hidden={section !== 'app'}>{app}</div>
    <div className="settings-workspace__panel" hidden={section !== 'guide'}><QuickStartGuide /></div>
  </section>;
}
