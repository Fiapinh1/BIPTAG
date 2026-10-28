import { afterEach, describe, expect, it, vi } from 'vitest';
import { isWebNfcSupported, startNfcReader } from '../src/services/nfc';
import { getNfcDiagnostics } from '../src/services/nfc-diagnostics';

function mockNfc() {
  class Reader extends EventTarget {
    static latest: Reader;
    signal?: AbortSignal;
    constructor() { super(); Reader.latest = this; }
    async scan(options: { signal: AbortSignal }) {
      this.signal = options.signal;
      options.signal.throwIfAborted();
    }
    read(tag: string) {
      const event = Object.assign(new Event('reading'), {
        message: { records: [{ recordType: 'text', encoding: 'utf-8', data: new DataView(new TextEncoder().encode(tag).buffer) }] }
      });
      this.dispatchEvent(event);
    }
  }
  vi.stubGlobal('window', { NDEFReader: Reader });
  vi.stubGlobal('NDEFReader', Reader);
  return Reader;
}

function createNfc() {
  const instances: EventTarget[] = [];
  const scan = vi.fn<(options: { signal: AbortSignal }) => Promise<void>>(async () => {});
  class Reader extends EventTarget {
    constructor() { super(); instances.push(this); }
    scan(options: { signal: AbortSignal }) { return scan(options); }
  }
  vi.stubGlobal('window', { isSecureContext: true, NDEFReader: Reader });
  vi.stubGlobal('NDEFReader', Reader);
  const read = () => {
    const event = Object.assign(new Event('reading'), {
      message: { records: [{ recordType: 'text', data: new DataView(new TextEncoder().encode('984000010772813').buffer) }] }
    });
    instances.at(-1)?.dispatchEvent(event);
  };
  const readText = (value: string) => {
    const event = Object.assign(new Event('reading'), {
      message: { records: [{ recordType: 'text', data: new DataView(new TextEncoder().encode(value).buffer) }] }
    });
    instances.at(-1)?.dispatchEvent(event);
  };
  const readWithoutRecords = () => {
    const event = Object.assign(new Event('reading'), { message: { records: [] } });
    instances.at(-1)?.dispatchEvent(event);
  };
  const readRecords = (records: NDEFRecord[]) => {
    instances.at(-1)?.dispatchEvent(Object.assign(new Event('reading'), { serialNumber: '04:AA:BB:CC:DD:EE:FF', message: { records } }));
  };
  return { scan, instances, read, readText, readWithoutRecords, readRecords };
}

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('phone NFC lifecycle', () => {
  it('stops delivering events after leaving phone mode', async () => {
    const Reader = mockNfc();
    const controller = new AbortController();
    const onRead = vi.fn();
    const onError = vi.fn();
    const stop = await startNfcReader(onRead, onError, controller.signal);
    Reader.latest.read('984000010514961');
    expect(onRead).toHaveBeenCalledWith({ tagNumber: '984000010514961', rawValue: '984000010514961' });
    controller.abort();
    Reader.latest.read('984000010514962');
    Reader.latest.dispatchEvent(new Event('readingerror'));
    expect(Reader.latest.signal?.aborted).toBe(true);
    expect(onRead).toHaveBeenCalledOnce();
    expect(onError).not.toHaveBeenCalled();
    stop();
  });

  it('stops reading when the user turns NFC off', async () => {
    const Reader = mockNfc();
    const onRead = vi.fn();
    const stop = await startNfcReader(onRead);
    stop();
    Reader.latest.read('984000010514961');
    expect(onRead).not.toHaveBeenCalled();
    expect(Reader.latest.signal?.aborted).toBe(true);
  });

  it('does not start scanning after a pending activation has been cancelled', async () => {
    const Reader = mockNfc();
    const controller = new AbortController();
    controller.abort();
    await expect(startNfcReader(vi.fn(), vi.fn(), controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(Reader.latest).toBeUndefined();
  });
});

describe('NFC permission and activation lifecycle', () => {
  it('reads the FER UTF-8/en Text record from the supplied TagInfo bytes without using the physical UID', async () => {
    const nfc = createNfc();
    const onRead = vi.fn();
    const stop = await startNfcReader(onRead);
    const message = Uint8Array.from([0xD1, 0x01, 0x12, 0x54, 0x02, 0x65, 0x6E, 0x39, 0x38, 0x34, 0x30, 0x30, 0x30, 0x30, 0x30, 0x39, 0x31, 0x35, 0x39, 0x33, 0x33, 0x39]);
    // Chrome exposes the text body after the NDEF header, status and language.
    nfc.readRecords([{ recordType: 'text', encoding: 'utf-8', lang: 'en', data: new DataView(message.buffer, 7, 15) }]);
    expect(onRead).toHaveBeenCalledExactlyOnceWith({ tagNumber: '984000009159339', rawValue: '984000009159339' });
    expect(getNfcDiagnostics().at(-1)).toMatchObject({ event: 'reading', records: [{ type: 'text', encoding: 'utf-8', language: 'en', byteLength: 15, text: '984000009159339', hex: '39 38 34 30 30 30 30 30 39 31 35 39 33 33 39' }] });
    stop();
  });

  it('finds a complete tag after empty, zero and metadata records instead of choosing only the first record', async () => {
    const nfc = createNfc();
    const onRead = vi.fn();
    const stop = await startNfcReader(onRead);
    const textRecord = (text: string) => ({ recordType: 'text', data: new DataView(new TextEncoder().encode(text).buffer) });
    nfc.readRecords([{ recordType: 'empty' } as NDEFRecord, textRecord('000000000000000'), textRecord('Versão 2'), textRecord('984000009159339')]);
    expect(onRead).toHaveBeenCalledExactlyOnceWith({ tagNumber: '984000009159339', rawValue: '984000009159339' });
    stop();
  });

  it('refuses conflicting tag numbers across records and accepts the next unambiguous read', async () => {
    const nfc = createNfc();
    const onRead = vi.fn(); const onError = vi.fn();
    const stop = await startNfcReader(onRead, onError);
    nfc.readRecords(['984000009159339', '984000010317471'].map((text) => ({ recordType: 'text', data: new DataView(new TextEncoder().encode(text).buffer) })));
    expect(onRead).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(expect.stringContaining('mais de um número'));
    nfc.readText('984000010317471');
    expect(onRead).toHaveBeenCalledExactlyOnceWith({ tagNumber: '984000010317471', rawValue: '984000010317471' });
    stop();
  });

  it('uses the configured tag length to distinguish a number from metadata', async () => {
    const nfc = createNfc(); const onRead = vi.fn();
    const stop = await startNfcReader(onRead, undefined, undefined, () => 14);
    nfc.readRecords(['Versão 2', '84000009159339'].map((text) => ({ recordType: 'text', data: new DataView(new TextEncoder().encode(text).buffer) })));
    expect(onRead).toHaveBeenCalledExactlyOnceWith({ tagNumber: '84000009159339', rawValue: '84000009159339' });
    stop();
  });

  it('does not turn a physical UID into a tag when no NDEF number was delivered', async () => {
    const nfc = createNfc(); const onRead = vi.fn();
    const stop = await startNfcReader(onRead, vi.fn());
    nfc.readRecords([]);
    expect(onRead).not.toHaveBeenCalled();
    stop();
    const diagnostics = getNfcDiagnostics();
    nfc.instances.at(-1)?.dispatchEvent(new Event('readingerror'));
    expect(getNfcDiagnostics()).toBe(diagnostics);
  });

  it('requests NFC directly from the activation call without awaiting another permission API', async () => {
    const nfc = createNfc();
    const onRead = vi.fn();
    const pending = startNfcReader(onRead);
    expect(nfc.scan).toHaveBeenCalledOnce();
    const stop = await pending;
    nfc.read();
    expect(onRead).toHaveBeenCalledWith({ tagNumber: '984000010772813', rawValue: '984000010772813' });
    stop();
    nfc.read();
    expect(onRead).toHaveBeenCalledOnce();
  });

  it('explains that a detected tag without NDEF data cannot be read by phone NFC', async () => {
    const nfc = createNfc();
    const onRead = vi.fn();
    const onError = vi.fn();
    const stop = await startNfcReader(onRead, onError);
    nfc.readWithoutRecords();
    expect(onRead).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(expect.stringContaining('não trouxe conteúdo NDEF legível'));
    expect(onError).toHaveBeenCalledWith(expect.stringContaining('bastão Bluetooth HHR5000SN'));
    stop();
  });

  it('rejects an all-zero NDEF value instead of treating it as a SmartTag number', async () => {
    const nfc = createNfc();
    const onRead = vi.fn();
    const onError = vi.fn();
    const stop = await startNfcReader(onRead, onError);
    nfc.readText('000000000000000');
    expect(onRead).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(expect.stringContaining('somente zeros'));
    stop();
  });

  it('surfaces permission denial and aborts its reader rather than leaving it running', async () => {
    const nfc = createNfc();
    nfc.scan.mockRejectedValueOnce(new DOMException('Permission denied', 'NotAllowedError'));
    const onRead = vi.fn();
    await expect(startNfcReader(onRead)).rejects.toMatchObject({ name: 'NotAllowedError' });
    expect(nfc.scan.mock.calls[0][0].signal.aborted).toBe(true);
    nfc.read();
    expect(onRead).not.toHaveBeenCalled();
  });

  it('allows cancelling a pending activation and later activating a new reader', async () => {
    const nfc = createNfc();
    nfc.scan.mockImplementationOnce(({ signal }) => new Promise((_, reject) => {
      signal.addEventListener('abort', () => reject(new DOMException('Cancelled', 'AbortError')), { once: true });
    }));
    const controller = new AbortController();
    const onRead = vi.fn();
    const pending = startNfcReader(onRead, undefined, controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    const stop = await startNfcReader(onRead);
    nfc.read();
    expect(onRead).toHaveBeenCalledOnce();
    expect(nfc.instances).toHaveLength(2);
    stop();
  });

  it('does not ask for permission when its activation has already been cancelled', async () => {
    const nfc = createNfc();
    const controller = new AbortController();
    controller.abort();
    await expect(startNfcReader(vi.fn(), undefined, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(nfc.scan).not.toHaveBeenCalled();
    expect(nfc.instances).toHaveLength(0);
  });

  it('detects an insecure origin without opening a permission request', async () => {
    const nfc = createNfc();
    vi.stubGlobal('window', { ...window, isSecureContext: false });
    expect(isWebNfcSupported()).toBe(false);
    await expect(startNfcReader(vi.fn())).rejects.toThrow('HTTPS');
    expect(nfc.scan).not.toHaveBeenCalled();
  });

  it('detects missing browser support instead of showing an endless activation', async () => {
    vi.stubGlobal('window', { isSecureContext: true });
    expect(isWebNfcSupported()).toBe(false);
    await expect(startNfcReader(vi.fn())).rejects.toThrow('Chrome no Android');
  });

  it('cancels immediately even when the native scan promise ignores cancellation', async () => {
    const nfc = createNfc();
    let resolveOldScan!: () => void;
    nfc.scan.mockImplementationOnce(() => new Promise((resolve) => { resolveOldScan = resolve; }));
    const controller = new AbortController();
    const pending = startNfcReader(vi.fn(), undefined, controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    const onRead = vi.fn();
    const stop = await startNfcReader(onRead);
    resolveOldScan();
    await Promise.resolve();
    expect(nfc.scan.mock.calls[1][0].signal.aborted).toBe(false);
    nfc.read();
    expect(onRead).toHaveBeenCalledOnce();
    stop();
  });

  it('does not require AbortSignal.throwIfAborted to activate NFC', async () => {
    const nfc = createNfc();
    const controller = new AbortController();
    vi.spyOn(controller.signal, 'throwIfAborted').mockImplementation(() => { throw new Error('Unavailable'); });
    const stop = await startNfcReader(vi.fn(), undefined, controller.signal);
    expect(nfc.scan).toHaveBeenCalledOnce();
    stop();
  });
});
