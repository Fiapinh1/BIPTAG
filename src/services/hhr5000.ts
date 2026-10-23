export const HHR5000_SERVICE_UUID = '2456e1b9-26e2-8f83-e744-f34f01e9d701';
export const HHR5000_PRIMARY_CHARACTERISTIC_UUID = '2456e1b9-26e2-8f83-e744-f34f01e9d703';
export const HHR5000_SECONDARY_CHARACTERISTIC_UUID = '2456e1b9-26e2-8f83-e744-f34f01e9d704';

export interface HHR5000ScanResult {
  tagNumber: string;
  rawValue: string;
  bytes: number[];
  hex: string;
  ascii: string;
  utf8: string;
  finalString: string;
}

export interface HHR5000Connection {
  device: BluetoothDevice;
  deviceName: string;
  disconnect: () => void;
}

export function isWebBluetoothSupported() {
  return typeof navigator !== 'undefined' && Boolean(navigator.bluetooth);
}

function bytesFromDataView(value: DataView) {
  return Array.from(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
}

function bytesToHex(bytes: number[]) {
  return bytes.map((byte) => byte.toString(16).padStart(2, '0').toUpperCase()).join(' ');
}

function bytesToAscii(bytes: number[]) {
  return bytes
    .map((byte) => (byte >= 32 && byte <= 126 ? String.fromCharCode(byte) : '.'))
    .join('');
}

function decodeUtf8(bytes: number[]) {
  try {
    return new TextDecoder('utf-8').decode(new Uint8Array(bytes));
  } catch {
    return '';
  }
}

function normalizeHHR5000Value(value: string) {
  const trimmed = value.trim();
  const numericGroups = trimmed.match(/\d{10,}/g) ?? [];
  const strongestGroup = numericGroups.sort((a, b) => b.length - a.length)[0];
  if (strongestGroup) return strongestGroup;

  const digitsOnly = trimmed.replace(/[^0-9]/g, '');
  return digitsOnly || trimmed;
}

function parseHHR5000Value(value: DataView): HHR5000ScanResult | null {
  const bytes = bytesFromDataView(value);
  const hex = bytesToHex(bytes);
  const ascii = bytesToAscii(bytes);
  const utf8 = decodeUtf8(bytes);
  const finalString = utf8.trim() || ascii.trim();
  const tagNumber = normalizeHHR5000Value(finalString);

  console.debug('[HHR5000SN] Bytes recebidos', bytes);
  console.debug('[HHR5000SN] HEX recebido', hex);
  console.debug('[HHR5000SN] ASCII convertido', ascii);
  console.debug('[HHR5000SN] UTF8 convertido', utf8);
  console.debug('[HHR5000SN] String final', finalString);

  if (!tagNumber) return null;
  return { tagNumber, rawValue: finalString, bytes, hex, ascii, utf8, finalString };
}

export async function connectHHR5000(
  onRead: (result: HHR5000ScanResult) => void,
  onDisconnect?: () => void,
  options: { device?: BluetoothDevice; signal?: AbortSignal; onDeviceSelected?: (device: BluetoothDevice) => void } = {}
): Promise<HHR5000Connection> {
  if (!isWebBluetoothSupported()) {
    throw new Error('Web Bluetooth nao esta disponivel neste navegador. Use Chrome ou Edge em HTTPS.');
  }

  const device = options.device ?? await navigator.bluetooth!.requestDevice({
    filters: [
      { namePrefix: 'HHR5000' },
      { services: [HHR5000_SERVICE_UUID] }
    ],
    optionalServices: [HHR5000_SERVICE_UUID]
  });
  options.signal?.throwIfAborted();
  options.onDeviceSelected?.(device);
  let primaryCharacteristic: BluetoothRemoteGATTCharacteristic | undefined;
  let closed = false;

  function cleanup() {
    if (closed) return;
    closed = true;
    primaryCharacteristic?.removeEventListener('characteristicvaluechanged', handleValueChanged);
    device.removeEventListener('gattserverdisconnected', handleDisconnect);
    options.signal?.removeEventListener('abort', disconnect);
  }

  function disconnect() {
    cleanup();
    // Closing GATT also stops notifications, including when the reader is already off.
    if (device.gatt?.connected) device.gatt.disconnect();
  }

  const handleValueChanged = (event: Event) => {
    const characteristic = event.target as BluetoothRemoteGATTCharacteristic | null;
    if (closed || !characteristic?.value) return;

    const result = parseHHR5000Value(characteristic.value);
    if (result) onRead(result);
  };

  const handleDisconnect = () => {
    if (closed) return;
    cleanup();
    onDisconnect?.();
  };

  options.signal?.addEventListener('abort', disconnect, { once: true });
  device.addEventListener('gattserverdisconnected', handleDisconnect);
  try {
    const server = await device.gatt?.connect();
    options.signal?.throwIfAborted();
    if (!server || closed) throw new Error('Não foi possível conectar ao bastão.');
    const service = await server.getPrimaryService(HHR5000_SERVICE_UUID);
    options.signal?.throwIfAborted();
    if (closed) throw new Error('O bastão foi desconectado.');
    primaryCharacteristic = await service.getCharacteristic(HHR5000_PRIMARY_CHARACTERISTIC_UUID);
    options.signal?.throwIfAborted();
    if (closed) throw new Error('O bastão foi desconectado.');
    primaryCharacteristic.addEventListener('characteristicvaluechanged', handleValueChanged);
    await primaryCharacteristic.startNotifications();
    options.signal?.throwIfAborted();
    if (closed || !server.connected) throw new Error('O bastão foi desconectado.');
    return { device, deviceName: device.name ?? 'HHR5000SN', disconnect };
  } catch (error) {
    disconnect();
    throw error;
  }
}
