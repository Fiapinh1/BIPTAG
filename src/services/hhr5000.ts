import { isReaderSecureContext, throwIfReaderAborted } from './reader-access';

const connectionOwners = new Map<string, symbol>();

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

export interface HHR5000Diagnostic {
  at: string;
  event: 'notification' | 'accepted' | 'rejected';
  byteLength: number;
  hex: string;
  text: string;
  expectedLength: number;
  reason?: 'zeros' | 'incomplete' | 'invalid';
}

export const HHR5000_ZERO_MESSAGE = 'O bastão enviou somente zeros, sem um número de tag válido. Nada foi registrado. Aproxime novamente; se continuar, reconecte o bastão e confira se ele está desconectado de outros celulares ou apps.';

export function isWebBluetoothSupported() {
  return isReaderSecureContext() && typeof navigator !== 'undefined' && typeof navigator.bluetooth?.requestDevice === 'function';
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

function normalizeHHR5000Value(value: string, expectedLength: number): string | null {
  // Never turn status messages, truncated tags, or a longer numeric ID into a tag.
  if (/^[0-9\s-]+$/.test(value)) {
    // Some readers separate the country code from the rest of the identifier.
    const digits = value.replace(/[^0-9]/g, '');
    return digits.length === expectedLength ? digits : null;
  }
  const groups = value.match(/[0-9]+/g) ?? [];
  const candidates = groups.filter((group) => group.length === expectedLength);
  return candidates.length === 1 ? candidates[0] : null;
}

function parseHHR5000Value(bytes: number[], expectedLength: number): HHR5000ScanResult | null {
  const hex = bytesToHex(bytes);
  const ascii = bytesToAscii(bytes);
  const utf8 = decodeUtf8(bytes);
  const finalString = utf8.trim() || ascii.trim();
  const tagNumber = normalizeHHR5000Value(finalString, expectedLength);

  if (!tagNumber || /^0+$/.test(tagNumber)) return null;
  return { tagNumber, rawValue: finalString, bytes, hex, ascii, utf8, finalString };
}

function createHHR5000Stream(
  onRead: (result: HHR5000ScanResult) => void,
  getExpectedTagLength: () => number,
  onFrame: (bytes: number[], expectedLength: number, result: HHR5000ScanResult | null) => void
) {
  // A Bluetooth notification is a transport fragment, not a complete reader message.
  const IDLE_MS = 250;
  const PARTIAL_TIMEOUT_MS = 2000;
  const MAX_FRAME_BYTES = 512;
  let bytes: number[] = [];
  let overflow = false;
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  let expiryTimer: ReturnType<typeof setTimeout> | undefined;
  let expectedLength = getExpectedTagLength();

  function reset() {
    clearTimeout(idleTimer);
    clearTimeout(expiryTimer);
    idleTimer = undefined;
    expiryTimer = undefined;
    bytes = [];
    overflow = false;
  }

  function finish() {
    const result = !overflow && bytes.length ? parseHHR5000Value(bytes, expectedLength) : null;
    if (bytes.length || overflow) onFrame(bytes, expectedLength, result);
    reset();
    if (result) onRead(result);
  }

  function push(value: DataView) {
    const nextLength = getExpectedTagLength();
    if (nextLength !== expectedLength) { reset(); expectedLength = nextLength; }
    clearTimeout(idleTimer);
    clearTimeout(expiryTimer);

    for (const byte of bytesFromDataView(value)) {
      if (byte === 2) { reset(); continue; } // STX starts a new frame.
      if (byte === 0 || byte === 3 || byte === 10 || byte === 13) {
        finish(); // NUL, ETX, CR and LF terminate a frame, even across notifications.
      } else if (!overflow) {
        if (bytes.length < MAX_FRAME_BYTES) bytes.push(byte);
        else { bytes = []; overflow = true; }
      }
    }

    if (!bytes.length && !overflow) return;
    idleTimer = setTimeout(() => {
      // Readers without a terminator can finish after a quiet interval, but only
      // when the entire identifier is present. Keep short fragments for later packets.
      const text = decodeUtf8(bytes).trim();
      const zeroFrame = /^[0\s-]+$/.test(text) && text.replace(/[^0-9]/g, '').length === expectedLength;
      if (!overflow && (zeroFrame || parseHHR5000Value(bytes, expectedLength))) finish();
    }, IDLE_MS);
    expiryTimer = setTimeout(finish, PARTIAL_TIMEOUT_MS);
  }

  return { push, reset };
}

export async function connectHHR5000(
  onRead: (result: HHR5000ScanResult) => void,
  onDisconnect?: () => void,
  options: { device?: BluetoothDevice; signal?: AbortSignal; onDeviceSelected?: (device: BluetoothDevice) => void; getExpectedTagLength?: () => number; acceptAllDevices?: boolean; onReadError?: (message: string) => void; onDiagnostic?: (entry: HHR5000Diagnostic) => void } = {}
): Promise<HHR5000Connection> {
  if (!isReaderSecureContext()) throw new Error('Abra o BIPTAG pelo endereço HTTPS para permitir acesso ao Bluetooth.');
  if (!isWebBluetoothSupported()) {
    throw new Error('Web Bluetooth nao esta disponivel neste navegador. Use Chrome ou Edge em HTTPS.');
  }

  throwIfReaderAborted(options.signal);
  const device = options.device ?? await navigator.bluetooth!.requestDevice({
    ...(options.acceptAllDevices ? { acceptAllDevices: true } : { filters: [
      { namePrefix: 'HHR5000' },
      { services: [HHR5000_SERVICE_UUID] }
    ] }),
    optionalServices: [HHR5000_SERVICE_UUID]
  });
  throwIfReaderAborted(options.signal);
  options.onDeviceSelected?.(device);
  const owner = Symbol('HHR5000 connection');
  connectionOwners.set(device.id, owner);
  let primaryCharacteristic: BluetoothRemoteGATTCharacteristic | undefined;
  let closed = false;
  let opening = true;
  const ownsConnection = () => connectionOwners.get(device.id) === owner;
  const getExpectedLength = options.getExpectedTagLength ?? (() => 15);
  function diagnose(bytes: number[], event: HHR5000Diagnostic['event'], expectedLength: number, reason?: HHR5000Diagnostic['reason']) {
    if (closed || !ownsConnection()) return;
    // A bounded copy preserves the actual transport data, including zero bytes.
    // Never persist it to the audit or reinterpret undocumented binary formats.
    const sample = bytes.slice(0, 96);
    options.onDiagnostic?.({ at: new Date().toISOString(), event, byteLength: bytes.length,
      hex: bytesToHex(sample), text: decodeUtf8(sample), expectedLength, reason });
  }
  const stream = createHHR5000Stream((result) => { if (!closed && ownsConnection()) onRead(result); }, getExpectedLength,
    (bytes, expectedLength, result) => {
      const text = decodeUtf8(bytes).trim();
      const digits = text.replace(/[^0-9]/g, '');
      const reason = result ? undefined : digits && /^0+$/.test(digits) ? 'zeros'
        : digits.length > 0 && digits.length < expectedLength ? 'incomplete' : 'invalid';
      diagnose(bytes, result ? 'accepted' : 'rejected', expectedLength, reason);
      const zeroIdentifier = reason === 'zeros' && (digits.length === expectedLength || /^[0\s-]+$/.test(text) && digits.length > 1);
      if (zeroIdentifier && !closed && ownsConnection()) options.onReadError?.(HHR5000_ZERO_MESSAGE);
    });

  function ensureOpen() {
    throwIfReaderAborted(options.signal);
    if (closed || !ownsConnection()) throw new DOMException('Conexão cancelada ou substituída.', 'AbortError');
  }

  function cleanup() {
    if (closed) return;
    closed = true;
    stream.reset();
    primaryCharacteristic?.removeEventListener('characteristicvaluechanged', handleValueChanged);
    device.removeEventListener('gattserverdisconnected', handleDisconnect);
    options.signal?.removeEventListener('abort', disconnect);
  }

  function disconnect() {
    cleanup();
    // Closing GATT also stops notifications, including when the reader is already off.
    // An older pending attempt must never close a newer connection to this reader.
    if (ownsConnection()) {
      if (device.gatt?.connected) device.gatt.disconnect();
      if (!opening) connectionOwners.delete(device.id);
    }
  }

  const handleValueChanged = (event: Event) => {
    const characteristic = event.target as BluetoothRemoteGATTCharacteristic | null;
    if (closed || !characteristic?.value) return;

    diagnose(bytesFromDataView(characteristic.value), 'notification', getExpectedLength());
    stream.push(characteristic.value);
  };

  const handleDisconnect = () => {
    if (closed) return;
    cleanup();
    if (ownsConnection()) {
      if (!opening) connectionOwners.delete(device.id);
      onDisconnect?.();
    }
  };

  options.signal?.addEventListener('abort', disconnect, { once: true });
  device.addEventListener('gattserverdisconnected', handleDisconnect);
  try {
    const server = await device.gatt?.connect();
    ensureOpen();
    if (!server || closed) throw new Error('Não foi possível conectar ao bastão.');
    const service = await server.getPrimaryService(HHR5000_SERVICE_UUID);
    ensureOpen();
    if (closed) throw new Error('O bastão foi desconectado.');
    primaryCharacteristic = await service.getCharacteristic(HHR5000_PRIMARY_CHARACTERISTIC_UUID);
    ensureOpen();
    if (closed) throw new Error('O bastão foi desconectado.');
    primaryCharacteristic.addEventListener('characteristicvaluechanged', handleValueChanged);
    await primaryCharacteristic.startNotifications();
    ensureOpen();
    if (closed || !server.connected) throw new Error('O bastão foi desconectado.');
    opening = false;
    return { device, deviceName: device.name ?? 'HHR5000SN', disconnect };
  } catch (error) {
    opening = false;
    disconnect();
    throw error;
  }
}
