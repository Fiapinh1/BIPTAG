import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { connectHHR5000, HHR5000_PRIMARY_CHARACTERISTIC_UUID } from '../src/services/hhr5000';

function createReader() {
  const characteristic = Object.assign(new EventTarget(), {
    value: undefined as DataView | undefined,
    startNotifications: vi.fn(async () => characteristic),
    stopNotifications: vi.fn(async () => characteristic),
    readValue: vi.fn(), writeValue: vi.fn()
  });
  const device = Object.assign(new EventTarget(), { id: 'reader-1', name: 'HHR5000-test', gatt: undefined as unknown as BluetoothRemoteGATTServer });
  const getCharacteristic = vi.fn(async () => characteristic);
  const gatt = {
    connected: false,
    connect: vi.fn(async () => { gatt.connected = true; return gatt; }),
    disconnect: vi.fn(() => { gatt.connected = false; device.dispatchEvent(new Event('gattserverdisconnected')); }),
    getPrimaryService: vi.fn(async () => ({ getCharacteristic }))
  };
  device.gatt = gatt;
  const requestDevice = vi.fn(async () => device);
  vi.stubGlobal('navigator', { bluetooth: { requestDevice } });
  const read = (tag: string | Uint8Array) => {
    const bytes = typeof tag === 'string' ? new TextEncoder().encode(tag) : tag;
    characteristic.value = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    characteristic.dispatchEvent(new Event('characteristicvaluechanged'));
  };
  return { device, characteristic, gatt, requestDevice, getCharacteristic, read };
}

beforeEach(() => { vi.spyOn(console, 'debug').mockImplementation(() => {}); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('HHR5000 connection lifecycle', () => {
  it('selects a reader, subscribes to tags and disconnects without notifying an unexpected loss', async () => {
    const reader = createReader();
    const onRead = vi.fn();
    const onDisconnect = vi.fn();
    const connection = await connectHHR5000(onRead, onDisconnect);
    expect(reader.requestDevice).toHaveBeenCalledOnce();
    expect(reader.getCharacteristic).toHaveBeenCalledWith(HHR5000_PRIMARY_CHARACTERISTIC_UUID);
    reader.read('984000010514961\r\n');
    expect(onRead).toHaveBeenCalledWith(expect.objectContaining({ tagNumber: '984000010514961' }));
    connection.disconnect();
    connection.disconnect();
    reader.read('984000010514962');
    expect(onRead).toHaveBeenCalledOnce();
    expect(reader.gatt.disconnect).toHaveBeenCalledOnce();
    expect(onDisconnect).not.toHaveBeenCalled();
  });

  it('reuses an authorized device and restores notifications after unexpected disconnection', async () => {
    const reader = createReader();
    const onRead = vi.fn();
    const onDisconnect = vi.fn();
    await connectHHR5000(onRead, onDisconnect, { device: reader.device });
    reader.gatt.disconnect();
    expect(onDisconnect).toHaveBeenCalledOnce();
    reader.read('984000010514961');
    expect(onRead).not.toHaveBeenCalled();
    const next = await connectHHR5000(onRead, onDisconnect, { device: reader.device });
    reader.read('984000010514962\r\n');
    expect(onRead).toHaveBeenCalledOnce();
    expect(reader.requestDevice).not.toHaveBeenCalled();
    expect(reader.characteristic.startNotifications).toHaveBeenCalledTimes(2);
    next.disconnect();
  });

  it('closes GATT and removes listeners if notifications fail to start', async () => {
    const reader = createReader();
    reader.characteristic.startNotifications.mockRejectedValueOnce(new Error('Failed to subscribe'));
    const onRead = vi.fn();
    const onDisconnect = vi.fn();
    await expect(connectHHR5000(onRead, onDisconnect)).rejects.toThrow('Failed to subscribe');
    expect(reader.gatt.connected).toBe(false);
    reader.read('984000010514961');
    expect(onRead).not.toHaveBeenCalled();
    expect(onDisconnect).not.toHaveBeenCalled();
  });

  it('cleans up a connection that completes after cancellation', async () => {
    const reader = createReader();
    const controller = new AbortController();
    let finishConnect!: () => void;
    reader.gatt.connect.mockImplementationOnce(() => new Promise((resolve) => {
      finishConnect = () => { reader.gatt.connected = true; resolve(reader.gatt); };
    }));
    const pending = connectHHR5000(vi.fn(), vi.fn(), { device: reader.device, signal: controller.signal });
    controller.abort();
    finishConnect();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(reader.gatt.connected).toBe(false);
    expect(reader.characteristic.startNotifications).not.toHaveBeenCalled();
  });

  it('cleans up an active connection on abort', async () => {
    const reader = createReader();
    const controller = new AbortController();
    const onRead = vi.fn();
    const onDisconnect = vi.fn();
    await connectHHR5000(onRead, onDisconnect, { signal: controller.signal });
    controller.abort();
    reader.read('984000010514961');
    expect(reader.gatt.connected).toBe(false);
    expect(onRead).not.toHaveBeenCalled();
    expect(onDisconnect).not.toHaveBeenCalled();
  });
});

describe('HHR5000 fragmented Bluetooth readings', () => {
  beforeEach(() => { vi.useFakeTimers(); });

  it('waits for all fragments instead of treating the first digit as a tag', async () => {
    const reader = createReader();
    const onRead = vi.fn();
    const connection = await connectHHR5000(onRead);
    reader.read('9');
    await vi.advanceTimersByTimeAsync(300);
    expect(onRead).not.toHaveBeenCalled();
    reader.read('840000107');
    reader.read('72813\r');
    reader.read('\n');
    expect(onRead).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      tagNumber: '984000010772813', rawValue: '984000010772813',
      bytes: Array.from(new TextEncoder().encode('984000010772813'))
    }));
    connection.disconnect();
  });

  it('discards status digits and incomplete frames without blocking the next full tag', async () => {
    const reader = createReader();
    const onRead = vi.fn();
    const connection = await connectHHR5000(onRead);
    reader.read('2\r\n');
    reader.read('HHR5000SN ready\r\n');
    reader.read('98400\r\n');
    expect(onRead).not.toHaveBeenCalled();
    reader.read('984000010772813\r\n');
    expect(onRead).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ tagNumber: '984000010772813' }));
    connection.disconnect();
  });

  it('accepts a tag sent one character at a time without a line ending after transmission settles', async () => {
    const reader = createReader();
    const onRead = vi.fn();
    const connection = await connectHHR5000(onRead);
    for (const digit of '984000010772813') {
      reader.read(digit);
      await vi.advanceTimersByTimeAsync(20);
    }
    expect(onRead).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(300);
    expect(onRead).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ tagNumber: '984000010772813' }));
    connection.disconnect();
  });

  it.each(Array.from({ length: 14 }, (_, index) => index + 1))('assembles a framed tag split after digit %i', async (splitAt) => {
    const reader = createReader();
    const onRead = vi.fn();
    const connection = await connectHHR5000(onRead);
    const tag = '984000010772813';
    reader.read(tag.slice(0, splitAt));
    expect(onRead).not.toHaveBeenCalled();
    reader.read(`${tag.slice(splitAt)}\r\n`);
    expect(onRead).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ tagNumber: tag }));
    connection.disconnect();
  });

  it('uses only the DataView bytes, not unrelated bytes in its backing buffer', async () => {
    const reader = createReader();
    const onRead = vi.fn();
    const connection = await connectHHR5000(onRead);
    const backing = new TextEncoder().encode('2BAD984000010772813\r\nBAD7');
    reader.read(backing.subarray(4, backing.length - 4));
    expect(onRead).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ tagNumber: '984000010772813' }));
    connection.disconnect();
  });

  it('uses the active audit length without reconnecting or keeping fragments from the previous pattern', async () => {
    const reader = createReader();
    const onRead = vi.fn();
    let length = 15;
    const connection = await connectHHR5000(onRead, undefined, { getExpectedTagLength: () => length });
    reader.read('9840000');
    length = 14;
    reader.read('84000010772813\r\n');
    expect(onRead).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ tagNumber: '84000010772813' }));
    expect(reader.gatt.connect).toHaveBeenCalledOnce();
    connection.disconnect();
  });

  it('does not rewrite a complete tag with a different prefix to match the farm', async () => {
    const reader = createReader();
    const onRead = vi.fn();
    const connection = await connectHHR5000(onRead);
    reader.read('982000010772813\r\n');
    expect(onRead).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ tagNumber: '982000010772813' }));
    connection.disconnect();
  });

  it('does not collapse two identifiers in one ambiguous frame into a single tag', async () => {
    const reader = createReader();
    const onRead = vi.fn();
    const connection = await connectHHR5000(onRead);
    reader.read('984000010772813 984000010772887\r\n');
    expect(onRead).not.toHaveBeenCalled();
    reader.read('984000010772813\r\n');
    expect(onRead).toHaveBeenCalledOnce();
    connection.disconnect();
  });

  it('does not truncate a longer transmission when its first packet happens to contain 15 digits', async () => {
    const reader = createReader();
    const onRead = vi.fn();
    const connection = await connectHHR5000(onRead);
    reader.read('984000010772813');
    reader.read('7\r\n');
    reader.read('984000010772813 7\r\n');
    await vi.advanceTimersByTimeAsync(300);
    expect(onRead).not.toHaveBeenCalled();
    reader.read('984000010772887\r\n');
    expect(onRead).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ tagNumber: '984000010772887' }));
    connection.disconnect();
  });

  it('separates several framed tags and preserves leading zeros and country-code spacing', async () => {
    const reader = createReader();
    const onRead = vi.fn();
    const connection = await connectHHR5000(onRead);
    reader.read('\u0002984 000010772813\u0003\r\n000000010772887\u0000');
    expect(onRead.mock.calls.map(([result]) => result.tagNumber)).toEqual(['984000010772813', '000000010772887']);
    connection.disconnect();
  });

  it('does not combine an abandoned fragment with a later read after the timeout', async () => {
    const reader = createReader();
    const onRead = vi.fn();
    const connection = await connectHHR5000(onRead);
    reader.read('2');
    await vi.advanceTimersByTimeAsync(2500);
    expect(onRead).not.toHaveBeenCalled();
    reader.read('984000010772813');
    await vi.advanceTimersByTimeAsync(300);
    expect(onRead).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ tagNumber: '984000010772813' }));
    connection.disconnect();
  });

  it('clears partial data and timers on an unexpected disconnection', async () => {
    const reader = createReader();
    const onRead = vi.fn();
    await connectHHR5000(onRead);
    reader.read('9840000');
    reader.gatt.disconnect();
    const connection = await connectHHR5000(onRead, undefined, { device: reader.device });
    reader.read('10772813\r\n');
    await vi.advanceTimersByTimeAsync(2500);
    expect(onRead).not.toHaveBeenCalled();
    reader.read('984000010772813');
    connection.disconnect();
    await vi.advanceTimersByTimeAsync(2500);
    expect(onRead).not.toHaveBeenCalled();
  });

  it('rejects overlong frames without carving out a valid-looking tag and recovers at the next boundary', async () => {
    const reader = createReader();
    const onRead = vi.fn();
    const connection = await connectHHR5000(onRead);
    reader.read('9'.repeat(600));
    reader.read('984000010772813\r\n');
    expect(onRead).not.toHaveBeenCalled();
    reader.read('984000010772887\r\n');
    expect(onRead).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ tagNumber: '984000010772887' }));
    connection.disconnect();
  });
});
