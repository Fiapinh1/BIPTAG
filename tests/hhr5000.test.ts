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
  const read = (tag: string) => {
    const bytes = new TextEncoder().encode(tag);
    characteristic.value = new DataView(bytes.buffer);
    characteristic.dispatchEvent(new Event('characteristicvaluechanged'));
  };
  return { device, characteristic, gatt, requestDevice, getCharacteristic, read };
}

beforeEach(() => { vi.spyOn(console, 'debug').mockImplementation(() => {}); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

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
    reader.read('984000010514962');
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
