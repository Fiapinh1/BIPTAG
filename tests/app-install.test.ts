import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let cleanup = () => {};
function environment(installed = false) {
  const display = Object.assign(new EventTarget(), { matches: installed });
  const target = Object.assign(new EventTarget(), { matchMedia: () => display });
  vi.stubGlobal('window', target);
  vi.stubGlobal('navigator', {});
  return { display, target };
}
beforeEach(() => vi.resetModules());
afterEach(() => { cleanup(); cleanup = () => {}; vi.unstubAllGlobals(); });

describe('app installation', () => {
  it('captures the browser prompt and opens it only in the explicit install call, once', async () => {
    const env = environment();
    const install = await import('../src/services/app-install');
    cleanup = install.initializeAppInstall();
    const prompt = vi.fn(async () => {});
    const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
      prompt, userChoice: Promise.resolve({ outcome: 'accepted' })
    });
    env.target.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(prompt).not.toHaveBeenCalled();
    const pending = install.requestAppInstall();
    expect(prompt).toHaveBeenCalledOnce();
    await pending;
    expect(install.getInstallState().installed).toBe(false);
    expect(await install.requestAppInstall()).toBe('guide');
    expect(prompt).toHaveBeenCalledOnce();
    env.target.dispatchEvent(new Event('appinstalled'));
    expect(install.getInstallState()).toMatchObject({ installed: true, available: false, prompting: false });
  });

  it('offers instructions without claiming the app is installed when the browser does not expose a prompt', async () => {
    environment();
    const install = await import('../src/services/app-install');
    cleanup = install.initializeAppInstall();
    expect(await install.requestAppInstall()).toBe('guide');
    expect(install.getInstallState().installed).toBe(false);
  });

  it('lets the user cancel and waits for a fresh native event before trying again', async () => {
    const env = environment();
    const install = await import('../src/services/app-install');
    cleanup = install.initializeAppInstall();
    const prompt = vi.fn(async () => {});
    const dispatch = () => env.target.dispatchEvent(Object.assign(new Event('beforeinstallprompt', { cancelable: true }), { prompt, userChoice: Promise.resolve({ outcome: 'dismissed' }) }));
    dispatch(); await install.requestAppInstall();
    expect(install.getInstallState().message).toContain('cancelada');
    expect(await install.requestAppInstall()).toBe('guide');
    dispatch(); await install.requestAppInstall();
    expect(prompt).toHaveBeenCalledTimes(2);
  });

  it('detects installed display mode and iOS standalone mode', async () => {
    environment(true);
    const install = await import('../src/services/app-install');
    cleanup = install.initializeAppInstall();
    expect(install.getInstallState().installed).toBe(true);
    cleanup(); vi.resetModules(); environment(); Object.assign(navigator, { standalone: true });
    const ios = await import('../src/services/app-install');
    cleanup = ios.initializeAppInstall();
    expect(ios.getInstallState().installed).toBe(true);
  });

  it('recovers to instructions if a browser rejects the native prompt', async () => {
    const env = environment();
    const install = await import('../src/services/app-install');
    cleanup = install.initializeAppInstall();
    env.target.dispatchEvent(Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
      prompt: vi.fn(async () => { throw new Error('Not permitted'); }), userChoice: Promise.resolve({ outcome: 'dismissed' })
    }));
    expect(await install.requestAppInstall()).toBe('guide');
    expect(install.getInstallState()).toMatchObject({ installed: false, prompting: false, available: false });
  });
});
