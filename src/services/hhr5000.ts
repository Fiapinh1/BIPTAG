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
  onDisconnect?: () => void
): Promise<HHR5000Connection> {
  if (!isWebBluetoothSupported()) {
    throw new Error('Web Bluetooth nao esta disponivel neste navegador. Use Chrome ou Edge em HTTPS.');
  }

  const device = await navigator.bluetooth!.requestDevice({
    filters: [
      { namePrefix: 'HHR5000' },
      { services: [HHR5000_SERVICE_UUID] }
    ],
    optionalServices: [HHR5000_SERVICE_UUID]
  });

  const server = await device.gatt?.connect();
  if (!server) throw new Error('Nao foi possivel conectar ao GATT do HHR5000SN.');

  const service = await server.getPrimaryService(HHR5000_SERVICE_UUID);
  const primaryCharacteristic = await service.getCharacteristic(HHR5000_PRIMARY_CHARACTERISTIC_UUID);

  try {
    await service.getCharacteristic(HHR5000_SECONDARY_CHARACTERISTIC_UUID);
    console.debug('[HHR5000SN] Characteristic secundaria encontrada', HHR5000_SECONDARY_CHARACTERISTIC_UUID);
  } catch (err) {
    console.debug('[HHR5000SN] Characteristic secundaria indisponivel ou nao utilizada', err);
  }

  const handleValueChanged = (event: Event) => {
    const characteristic = event.target as BluetoothRemoteGATTCharacteristic | null;
    if (!characteristic?.value) return;

    const result = parseHHR5000Value(characteristic.value);
    if (result) onRead(result);
  };

  const handleDisconnect = () => {
    onDisconnect?.();
  };

  await primaryCharacteristic.startNotifications();
  primaryCharacteristic.addEventListener('characteristicvaluechanged', handleValueChanged);
  device.addEventListener('gattserverdisconnected', handleDisconnect);

  return {
    deviceName: device.name ?? 'HHR5000SN',
    disconnect: () => {
      primaryCharacteristic.removeEventListener('characteristicvaluechanged', handleValueChanged);
      device.removeEventListener('gattserverdisconnected', handleDisconnect);
      void primaryCharacteristic.stopNotifications().catch((err) => {
        console.debug('[HHR5000SN] Nao foi possivel parar notificacoes', err);
      });
      if (device.gatt?.connected) device.gatt.disconnect();
    }
  };
}
