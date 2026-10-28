import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { CheckIcon, DownloadIcon } from '../icons/Icons';
import { getInstallState, requestAppInstall, subscribeInstallState } from '../services/app-install';
import { checkForAppUpdate, getAppUpdateState, subscribeAppUpdates } from '../services/app-updates';

export function AppInstallPanel({ compact = false }: { compact?: boolean }) {
  const install = useSyncExternalStore(subscribeInstallState, getInstallState);
  const update = useSyncExternalStore(subscribeAppUpdates, getAppUpdateState);
  const [showGuide, setShowGuide] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const ios = /iPad|iPhone|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const android = /Android/i.test(navigator.userAgent);

  useEffect(() => {
    if (showGuide && !dialog.current?.open) dialog.current?.showModal();
    if (!showGuide && dialog.current?.open) dialog.current?.close();
  }, [showGuide]);
  useEffect(() => { if (install.installed) setShowGuide(false); }, [install.installed]);

  async function installApp() {
    if (await requestAppInstall() === 'guide') setShowGuide(true);
  }

  if (compact && install.installed) return null;
  const button = <button className={`button ${compact ? 'button--ghost' : 'button--primary'} app-install-button`} onClick={() => void installApp()} disabled={install.installed || install.prompting}>
    {install.installed ? <CheckIcon size={19} /> : <DownloadIcon size={19} />}
    {install.installed ? 'App instalado' : install.prompting ? 'Aguardando instalação…' : 'Instalar no celular'}
  </button>;
  const guide = <dialog ref={dialog} className="reader-settings app-install-guide" aria-labelledby="app-install-guide-title" onCancel={() => setShowGuide(false)} onClose={() => setShowGuide(false)} onClick={(event) => { if (event.target === event.currentTarget) setShowGuide(false); }}>
    <div className="reader-settings__content">
      <div className="reader-settings__heading"><h2 id="app-install-guide-title">Instalar BIPTAG</h2><button className="app-modal__close" onClick={() => setShowGuide(false)} aria-label="Fechar instruções de instalação">×</button></div>
      <p>Tenha o BIPTAG na tela inicial e abra suas auditorias pelo ícone do app.</p>
      {ios ? <ol><li>Abra o BIPTAG no Safari.</li><li>Toque em <strong>Compartilhar</strong>.</li><li>Escolha <strong>Adicionar à Tela de Início</strong> e confirme em <strong>Adicionar</strong>.</li></ol>
        : android ? <ol><li>Abra <strong>biptag.vercel.app</strong> no Chrome atualizado.</li><li>Toque no menu <strong>⋮</strong> do navegador.</li><li>Escolha <strong>Adicionar à tela inicial</strong> ou <strong>Instalar app</strong> e confirme.</li></ol>
          : <ol><li>Abra o BIPTAG no Chrome ou Edge.</li><li>Use o ícone de instalação na barra de endereço ou a opção <strong>Instalar BIPTAG</strong> no menu do navegador.</li></ol>}
      <p>Se a opção não aparecer, confira se o app já está instalado e se o navegador permite instalação. Você pode continuar usando o BIPTAG por aqui.</p>
      {install.available && <button className="button button--primary button--full" onClick={() => { setShowGuide(false); void installApp(); }}>Instalar agora</button>}
      <button className="button button--ghost button--full" onClick={() => setShowGuide(false)}>Entendi</button>
    </div>
  </dialog>;

  if (compact) return <div className="app-install-compact">{button}{install.message && <small role="status">{install.message}</small>}{guide}</div>;
  return <section className="app-install-panel" aria-labelledby="app-install-panel-title">
    <div><span className="eyebrow">NO SEU CELULAR</span><h2 id="app-install-panel-title">Instalação e atualizações</h2><p>Abra o BIPTAG direto pela tela inicial, com as auditorias salvas neste aparelho.</p></div>
    {button}
    {install.message && <p role="status">{install.message}</p>}
    <div className="app-install-panel__updates"><strong>Atualizações automáticas</strong><p>Com internet, o app busca e baixa novas versões sozinho. A atualização é aplicada fora da conferência, sem interromper o preenchimento de uma tela.</p>
      <button className="button button--ghost" disabled={update.checking} onClick={() => void checkForAppUpdate()}>{update.checking ? 'Verificando…' : 'Verificar atualização agora'}</button>
      {update.message && <p role="status">{update.message}</p>}
      <small>Versão carregada: {import.meta.env.VITE_BIPTAG_BUILD ? new Date(import.meta.env.VITE_BIPTAG_BUILD).toLocaleString('pt-BR') : 'desenvolvimento'}</small>
    </div>
    {guide}
  </section>;
}
