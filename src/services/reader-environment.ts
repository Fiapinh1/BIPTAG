import { isWebBluetoothSupported } from './hhr5000';
import { isWebNfcSupported } from './nfc';
import { isReaderSecureContext } from './reader-access';

export type NfcPermission = PermissionState | 'unknown';

export function getReaderEnvironment() {
  const agent = typeof navigator === 'undefined' ? '' : navigator.userAgent ?? '';
  const android = /Android/i.test(agent);
  const browser = /SamsungBrowser/i.test(agent) ? 'Samsung Internet'
    : /; wv\)/i.test(agent) ? 'Navegador interno de outro app'
      : /EdgA|EdgiOS|Edg\//i.test(agent) ? 'Microsoft Edge'
        : /Firefox|FxiOS/i.test(agent) ? 'Firefox'
          : /Chrome|CriOS/i.test(agent) ? 'Chrome'
            : /Safari/i.test(agent) ? 'Safari' : 'Navegador não identificado';
  const installed = typeof window !== 'undefined' && Boolean(window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone);
  return {
    browser, android, installed, secure: isReaderSecureContext(),
    topLevel: typeof window === 'undefined' || window.top === window.self,
    bluetoothSupported: isWebBluetoothSupported(), nfcSupported: isWebNfcSupported()
  };
}

export async function readNfcPermission(): Promise<NfcPermission> {
  // Querying only reads the current state. The native prompt belongs to scan(), on a click.
  try { return (await navigator.permissions.query({ name: 'nfc' as PermissionName })).state; }
  catch { return 'unknown'; }
}

export function chromeReaderUrl(origin: string) {
  const url = new URL('/', origin);
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return 'https://biptag.vercel.app/';
  return `intent://${url.host}/#Intent;scheme=${url.protocol.slice(0, -1)};package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(url.href)};end`;
}
