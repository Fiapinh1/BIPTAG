import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import DesignPreview from './design-preview/DesignPreview';
import { initializeAppInstall } from './services/app-install';
import { deferAppUpdateReload, initializeAppUpdates, setUpdateRegistration } from './services/app-updates';
import './styles.css';
import './styles/audit-workspace.css';
import './styles/farm-directory.css';
import './styles/audit-summary.css';
import './styles/navigation.css';
import './styles/app-install.css';

initializeAppInstall();
initializeAppUpdates();

const updateServiceWorker = registerSW({
  immediate: true,
  onNeedReload: deferAppUpdateReload,
  onNeedRefresh() {
    void updateServiceWorker(true);
  },
  onRegisteredSW(_swUrl, registration) {
    setUpdateRegistration(registration);
  },
  onRegisterError(error) {
    console.warn('Nao foi possivel registrar o atualizador do BIPTAG.', error);
  }
});

const Root = window.location.pathname.replace(/\/$/, '') === '/design-preview' ? DesignPreview : App;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>
);
