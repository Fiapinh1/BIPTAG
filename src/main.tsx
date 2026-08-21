import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import DesignPreview from './design-preview/DesignPreview';
import './styles.css';

const SW_UPDATE_RELOAD_KEY = 'biptag-sw-update-reload-at';

function reloadWhenUpdated() {
  const lastReload = Number(sessionStorage.getItem(SW_UPDATE_RELOAD_KEY) ?? 0);
  if (Date.now() - lastReload < 10_000) return;
  sessionStorage.setItem(SW_UPDATE_RELOAD_KEY, String(Date.now()));
  window.location.reload();
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', reloadWhenUpdated);
}

const updateServiceWorker = registerSW({
  immediate: true,
  onNeedRefresh() {
    void updateServiceWorker(true);
  },
  onRegisteredSW(_swUrl, registration) {
    if (!registration) return;

    const checkForUpdate = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        void registration.update();
      }
    };

    window.setTimeout(checkForUpdate, 3_000);
    window.setInterval(checkForUpdate, 30_000);
    window.addEventListener('online', checkForUpdate);
    document.addEventListener('visibilitychange', checkForUpdate);
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
