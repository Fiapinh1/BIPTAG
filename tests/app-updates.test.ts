import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let cleanup = () => {};
function environment(controlled = true) {
  const reload = vi.fn();
  const serviceWorker = Object.assign(new EventTarget(), { controller: controlled ? {} : null as unknown });
  const documentTarget = Object.assign(new EventTarget(), {
    visibilityState: 'visible', activeElement: null as unknown,
    querySelector: vi.fn(() => null as unknown), querySelectorAll: vi.fn(() => [] as unknown[])
  });
  const windowTarget = Object.assign(new EventTarget(), { location: { reload } });
  const storage = new Map<string, string>();
  vi.stubGlobal('window', windowTarget);
  vi.stubGlobal('document', documentTarget);
  vi.stubGlobal('navigator', { serviceWorker, onLine: true });
  vi.stubGlobal('sessionStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) });
  return { reload, serviceWorker, documentTarget, windowTarget, storage };
}
beforeEach(() => { vi.useFakeTimers(); vi.resetModules(); });
afterEach(() => { cleanup(); cleanup = () => {}; vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('automatic app updates', () => {
  it('detects a different published version even if a controller-change notification was missed', async () => {
    const env = environment();
    const fetch = vi.fn(async () => ({ ok: true, json: async () => ({ build: 'published-new-build' }) }));
    vi.stubGlobal('fetch', fetch);
    const updates = await import('../src/services/app-updates');
    cleanup = updates.initializeAppUpdates();
    updates.setUpdateRegistration({ update: vi.fn(async () => {}) } as unknown as ServiceWorkerRegistration);
    await updates.checkForAppUpdate();
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/version.json?'), { cache: 'no-store' });
    expect(updates.getAppUpdateState()).toMatchObject({ available: true, pending: false });
    expect(env.reload).not.toHaveBeenCalled();
  });

  it('waits for all protected screens to finish before applying an update once', async () => {
    const env = environment();
    const updates = await import('../src/services/app-updates');
    cleanup = updates.initializeAppUpdates();
    const leaveAudit = updates.blockAppUpdates();
    const finishSave = updates.blockAppUpdates();
    updates.deferAppUpdateReload();
    env.serviceWorker.dispatchEvent(new Event('controllerchange'));
    await vi.advanceTimersByTimeAsync(20_000);
    expect(env.reload).not.toHaveBeenCalled();
    leaveAudit();
    await vi.advanceTimersByTimeAsync(2000);
    expect(env.reload).not.toHaveBeenCalled();
    finishSave();
    await vi.advanceTimersByTimeAsync(1600);
    expect(env.reload).toHaveBeenCalledOnce();
    updates.deferAppUpdateReload();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(env.reload).toHaveBeenCalledOnce();
  });

  it('does not reload for the first worker taking control, but does for the next version', async () => {
    const env = environment(false);
    const updates = await import('../src/services/app-updates');
    cleanup = updates.initializeAppUpdates();
    env.serviceWorker.controller = {};
    env.serviceWorker.dispatchEvent(new Event('controllerchange'));
    await vi.advanceTimersByTimeAsync(2000);
    expect(env.reload).not.toHaveBeenCalled();
    expect(updates.getAppUpdateState().pending).toBe(false);
    env.serviceWorker.controller = {};
    env.serviceWorker.dispatchEvent(new Event('controllerchange'));
    await vi.advanceTimersByTimeAsync(4000);
    expect(env.reload).toHaveBeenCalledOnce();
  });

  it('preserves dialogs, focused fields and typed drafts until they are cleared', async () => {
    const env = environment();
    const updates = await import('../src/services/app-updates');
    cleanup = updates.initializeAppUpdates();
    env.documentTarget.querySelector.mockReturnValue({});
    updates.deferAppUpdateReload();
    await vi.advanceTimersByTimeAsync(2000);
    expect(env.reload).not.toHaveBeenCalled();
    env.documentTarget.querySelector.mockReturnValue(null);
    env.documentTarget.activeElement = { matches: () => true };
    await vi.advanceTimersByTimeAsync(2000);
    expect(env.reload).not.toHaveBeenCalled();
    env.documentTarget.activeElement = null;
    env.documentTarget.querySelectorAll.mockReturnValue([{ value: '4199' }]);
    await vi.advanceTimersByTimeAsync(2000);
    expect(env.reload).not.toHaveBeenCalled();
    env.documentTarget.querySelectorAll.mockReturnValue([]);
    env.documentTarget.dispatchEvent(new Event('input'));
    await vi.advanceTimersByTimeAsync(1600);
    expect(env.reload).toHaveBeenCalledOnce();
  });

  it('waits until the app returns to the foreground to reload', async () => {
    const env = environment();
    const updates = await import('../src/services/app-updates');
    cleanup = updates.initializeAppUpdates();
    env.documentTarget.visibilityState = 'hidden';
    updates.deferAppUpdateReload();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(env.reload).not.toHaveBeenCalled();
    env.documentTarget.visibilityState = 'visible';
    env.documentTarget.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(1600);
    expect(env.reload).toHaveBeenCalledOnce();
  });

  it('retains an update during the reload cooldown instead of dropping it', async () => {
    const env = environment();
    const updates = await import('../src/services/app-updates');
    cleanup = updates.initializeAppUpdates();
    env.storage.set('biptag-sw-update-reload-at', String(Date.now()));
    updates.deferAppUpdateReload();
    await vi.advanceTimersByTimeAsync(2000);
    expect(env.reload).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(8100);
    expect(env.reload).toHaveBeenCalledOnce();
  });

  it('retries checks when connectivity returns and handles failures without an unhandled rejection', async () => {
    const env = environment();
    const updates = await import('../src/services/app-updates');
    cleanup = updates.initializeAppUpdates();
    const update = vi.fn().mockRejectedValueOnce(new Error('Network offline')).mockResolvedValue(undefined);
    updates.setUpdateRegistration({ update } as unknown as ServiceWorkerRegistration);
    await updates.checkForAppUpdate();
    expect(updates.getAppUpdateState()).toMatchObject({ checking: false, message: expect.stringContaining('Tentaremos novamente') });
    Object.assign(navigator, { onLine: false });
    await updates.checkForAppUpdate();
    expect(update).toHaveBeenCalledOnce();
    Object.assign(navigator, { onLine: true });
    env.windowTarget.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(0);
    expect(update).toHaveBeenCalledTimes(2);
    expect(env.reload).not.toHaveBeenCalled();
  });
});
