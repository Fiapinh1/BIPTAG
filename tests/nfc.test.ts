import { afterEach, describe, expect, it, vi } from 'vitest';
import { startNfcReader } from '../src/services/nfc';

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

afterEach(() => vi.unstubAllGlobals());

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
    expect(Reader.latest.signal?.aborted).toBe(true);
  });
});
