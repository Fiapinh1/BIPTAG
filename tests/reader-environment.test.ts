import { afterEach, describe, expect, it, vi } from 'vitest';
import { chromeReaderUrl, getReaderEnvironment, readNfcPermission } from '../src/services/reader-environment';

function environment(agent: string, installed = false) {
  const browserWindow: Record<string, unknown> = { isSecureContext: true, matchMedia: () => ({ matches: installed }) };
  browserWindow.top = browserWindow; browserWindow.self = browserWindow;
  vi.stubGlobal('window', browserWindow);
  vi.stubGlobal('navigator', { userAgent: agent });
  return browserWindow;
}

afterEach(() => vi.unstubAllGlobals());

describe('Reader access in installed apps and browsers', () => {
  it('identifies an installed Samsung Internet access without mistaking it for Chrome', () => {
    environment('Mozilla/5.0 (Linux; Android 14) SamsungBrowser/27.0 Chrome/125.0 Mobile Safari/537.36', true);
    expect(getReaderEnvironment()).toMatchObject({ browser: 'Samsung Internet', installed: true, android: true, nfcSupported: false, bluetoothSupported: false });
  });

  it('uses actual exposed capabilities instead of blocking based on the browser name or installation mode', () => {
    const browserWindow = environment('Mozilla/5.0 (Linux; Android 16) SamsungBrowser/28.0 Chrome/128.0', true);
    browserWindow.NDEFReader = class {};
    Object.assign(navigator, { bluetooth: { requestDevice: vi.fn() } });
    expect(getReaderEnvironment()).toMatchObject({ nfcSupported: true, bluetoothSupported: true, installed: true });
  });

  it('reports a Chrome desktop without NFC as unsupported rather than denied', () => {
    environment('Mozilla/5.0 (Windows NT 10.0) Chrome/130.0 Safari/537.36');
    expect(getReaderEnvironment()).toMatchObject({ browser: 'Chrome', android: false, installed: false, nfcSupported: false });
  });

  it('recognizes an embedded Android webview', () => {
    environment('Mozilla/5.0 (Linux; Android 14; Phone Build/AB; wv) Chrome/125.0');
    expect(getReaderEnvironment().browser).toBe('Navegador interno de outro app');
  });

  it('reads NFC permission without starting a hardware request', async () => {
    const browserWindow = environment('Chrome/130.0 Android');
    const scan = vi.fn(); browserWindow.NDEFReader = class { scan = scan; };
    const query = vi.fn(async () => ({ state: 'denied' })); Object.assign(navigator, { permissions: { query } });
    expect(await readNfcPermission()).toBe('denied');
    expect(query).toHaveBeenCalledWith({ name: 'nfc' });
    expect(scan).not.toHaveBeenCalled();
  });

  it('does not call an unknown permission granted when the browser cannot query it', async () => {
    environment('Chrome/130.0 Android');
    Object.assign(navigator, { permissions: { query: vi.fn(async () => { throw new TypeError('Unknown permission'); }) } });
    expect(await readNfcPermission()).toBe('unknown');
  });

  it('provides an explicit Chrome link with a fallback to the same app', () => {
    const url = chromeReaderUrl('https://biptag.vercel.app');
    expect(url).toContain('package=com.android.chrome;');
    expect(url).toContain('S.browser_fallback_url=https%3A%2F%2Fbiptag.vercel.app%2F;');
  });
});
