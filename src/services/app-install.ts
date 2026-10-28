interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

type InstallState = { installed: boolean; available: boolean; prompting: boolean; message: string };
const listeners = new Set<() => void>();
let deferredPrompt: InstallPromptEvent | null = null;
let state: InstallState = { installed: false, available: false, prompting: false, message: '' };

function publish(patch: Partial<InstallState>) {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
}

export const getInstallState = () => state;
export function subscribeInstallState(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }

export function initializeAppInstall() {
  const standalone = window.matchMedia('(display-mode: standalone)');
  const installed = () => standalone.matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  publish({ installed: installed() });
  const beforeInstall = (event: Event) => {
    event.preventDefault();
    deferredPrompt = event as InstallPromptEvent;
    publish({ available: true, prompting: false, message: '' });
  };
  const appInstalled = () => {
    deferredPrompt = null;
    publish({ installed: true, available: false, prompting: false, message: 'BIPTAG instalado neste aparelho.' });
  };
  const displayChanged = () => { if (installed()) appInstalled(); };
  window.addEventListener('beforeinstallprompt', beforeInstall);
  window.addEventListener('appinstalled', appInstalled);
  standalone.addEventListener?.('change', displayChanged);
  return () => {
    window.removeEventListener('beforeinstallprompt', beforeInstall);
    window.removeEventListener('appinstalled', appInstalled);
    standalone.removeEventListener?.('change', displayChanged);
  };
}

export async function requestAppInstall(): Promise<'prompted' | 'guide'> {
  if (state.installed || state.prompting) return 'prompted';
  if (!deferredPrompt) return 'guide';
  const prompt = deferredPrompt;
  deferredPrompt = null; // The browser permits each event to be used only once.
  publish({ available: false, prompting: true, message: '' });
  try {
    // Invoke the native prompt in the original button gesture, before any await.
    await prompt.prompt();
    const choice = await prompt.userChoice;
    if (!state.installed) publish({ message: choice.outcome === 'accepted'
      ? 'Instalação solicitada. Aguarde o ícone do BIPTAG na tela inicial.'
      : 'Instalação cancelada. Você pode continuar usando o app e instalar depois.' });
    return 'prompted';
  } catch {
    publish({ message: 'O navegador não abriu a instalação. Siga as instruções abaixo.' });
    return 'guide';
  } finally { publish({ prompting: false }); }
}
