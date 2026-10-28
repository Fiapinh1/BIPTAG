type UpdateState = { pending: boolean; available: boolean; checking: boolean; message: string };
const listeners = new Set<() => void>();
const blockers = new Set<symbol>();
let state: UpdateState = { pending: false, available: false, checking: false, message: '' };
let registration: ServiceWorkerRegistration | undefined;
let reloadTimer: ReturnType<typeof setTimeout> | undefined;
let reloading = false;
const RELOAD_KEY = 'biptag-sw-update-reload-at';

function publish(patch: Partial<UpdateState>) {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
}
export const getAppUpdateState = () => state;
export function subscribeAppUpdates(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }

function editing() {
  if (document.querySelector('dialog[open], [role="dialog"][aria-modal="true"]')) return true;
  const active = document.activeElement as HTMLElement | null;
  if (active?.matches('input, textarea, select, [contenteditable="true"]')) return true;
  return Array.from(document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input:not([type="file"]):not([type="checkbox"]):not([type="radio"]):not([type="hidden"]), textarea'))
    .some((field) => Boolean(field.value.trim()));
}

function scheduleReload(delay = 1500) {
  clearTimeout(reloadTimer);
  if (!state.pending || reloading || blockers.size || document.visibilityState === 'hidden') return;
  reloadTimer = setTimeout(() => {
    if (blockers.size || document.visibilityState === 'hidden') return;
    if (editing()) { scheduleReload(); return; }
    let lastReload = 0;
    try { lastReload = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0); } catch { /* Storage is optional. */ }
    const remaining = 10_000 - (Date.now() - lastReload);
    if (remaining > 0) { scheduleReload(remaining); return; }
    reloading = true;
    try { sessionStorage.setItem(RELOAD_KEY, String(Date.now())); } catch { /* Storage is optional. */ }
    window.location.reload();
  }, delay);
}

export function deferAppUpdateReload() {
  publish({ pending: true, available: true, message: 'Atualização pronta. Volte ao Resumo para aplicar automaticamente ou toque em Aplicar atualização.' });
  scheduleReload();
}

export function blockAppUpdates() {
  const token = Symbol('screen in use');
  blockers.add(token);
  clearTimeout(reloadTimer);
  return () => { blockers.delete(token); scheduleReload(); };
}

export async function checkForAppUpdate() {
  if (state.checking || state.pending) return;
  if (!navigator.onLine) { publish({ message: 'Sem internet. A busca por atualizações será retomada automaticamente quando a conexão voltar.' }); return; }
  if (!registration) { publish({ message: 'Preparando as atualizações automáticas. Aguarde alguns instantes.' }); return; }
  publish({ checking: true, message: 'Buscando atualização…' });
  try {
    await registration.update();
    try {
      const response = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
      if (response.ok) {
        const published = await response.json();
        if (typeof published.build === 'string' && published.build !== import.meta.env.VITE_BIPTAG_BUILD) {
          publish({ available: true, message: 'Uma nova versão está disponível. Toque em Aplicar atualização para carregá-la.' });
        }
      }
    } catch { /* A failed version lookup must not prevent normal worker updates. */ }
    if (!state.pending && !state.available) publish({ message: 'Busca realizada. Novas versões serão aplicadas automaticamente quando estiverem prontas.' });
  } catch { publish({ message: 'Não foi possível buscar agora. Tentaremos novamente automaticamente.' }); }
  finally { publish({ checking: false }); }
}

export function setUpdateRegistration(value: ServiceWorkerRegistration | undefined) { registration = value; }

export function applyAppUpdate() { window.location.assign('/atualizar.html'); }

export function initializeAppUpdates() {
  if (!('serviceWorker' in navigator)) return () => {};
  let controlled = Boolean(navigator.serviceWorker.controller);
  const controllerChanged = () => {
    // First installation taking control is not an update and must not reload a form.
    if (controlled) deferAppUpdateReload();
    controlled = Boolean(navigator.serviceWorker.controller);
  };
  const visible = () => {
    if (document.visibilityState !== 'hidden') { void checkForAppUpdate(); scheduleReload(); }
  };
  const online = () => { void checkForAppUpdate(); scheduleReload(); };
  const activity = () => { if (state.pending) scheduleReload(); };
  navigator.serviceWorker.addEventListener('controllerchange', controllerChanged);
  document.addEventListener('visibilitychange', visible);
  document.addEventListener('input', activity);
  document.addEventListener('pointerdown', activity);
  document.addEventListener('keydown', activity);
  window.addEventListener('online', online);
  const firstCheck = setTimeout(visible, 3000);
  const interval = setInterval(() => { if (document.visibilityState !== 'hidden' && navigator.onLine) void checkForAppUpdate(); }, 30_000);
  return () => {
    clearTimeout(firstCheck); clearTimeout(reloadTimer); clearInterval(interval);
    navigator.serviceWorker.removeEventListener('controllerchange', controllerChanged);
    document.removeEventListener('visibilitychange', visible);
    document.removeEventListener('input', activity);
    document.removeEventListener('pointerdown', activity);
    document.removeEventListener('keydown', activity);
    window.removeEventListener('online', online);
  };
}
