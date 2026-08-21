import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import DesignPreview from './design-preview/DesignPreview';
import './styles.css';

const updateServiceWorker = registerSW({
  immediate: true,
  onNeedRefresh() {
    void updateServiceWorker(true);
  },
  onRegisteredSW(_swUrl, registration) {
    if (!registration) return;
    window.setInterval(() => {
      if (document.visibilityState === 'visible') void registration.update();
    }, 60 * 1000);
  }
});

const Root = window.location.pathname.replace(/\/$/, '') === '/design-preview' ? DesignPreview : App;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>
);
