interface BluetoothRemoteGATTCharacteristic extends EventTarget {
  value?: DataView;
  startNotifications(): Promise<BluetoothRemoteGATTCharacteristic>;
  stopNotifications(): Promise<BluetoothRemoteGATTCharacteristic>;
  readValue(): Promise<DataView>;
  writeValue(value: BufferSource): Promise<void>;
  addEventListener(
    type: 'characteristicvaluechanged',
    listener: (event: Event) => void,
    options?: boolean | AddEventListenerOptions
  ): void;
  removeEventListener(
    type: 'characteristicvaluechanged',
    listener: (event: Event) => void,
    options?: boolean | EventListenerOptions
  ): void;
}

interface BluetoothRemoteGATTService {
  getCharacteristic(characteristic: BluetoothCharacteristicUUID): Promise<BluetoothRemoteGATTCharacteristic>;
}

interface BluetoothRemoteGATTServer {
  connected: boolean;
  connect(): Promise<BluetoothRemoteGATTServer>;
  disconnect(): void;
  getPrimaryService(service: BluetoothServiceUUID): Promise<BluetoothRemoteGATTService>;
}

interface BluetoothDevice extends EventTarget {
  id: string;
  name?: string;
  gatt?: BluetoothRemoteGATTServer;
  addEventListener(
    type: 'gattserverdisconnected',
    listener: (event: Event) => void,
    options?: boolean | AddEventListenerOptions
  ): void;
  removeEventListener(
    type: 'gattserverdisconnected',
    listener: (event: Event) => void,
    options?: boolean | EventListenerOptions
  ): void;
}

type BluetoothServiceUUID = number | string;
type BluetoothCharacteristicUUID = number | string;

interface RequestDeviceOptions {
  filters?: Array<{
    name?: string;
    namePrefix?: string;
    services?: BluetoothServiceUUID[];
  }>;
  optionalServices?: BluetoothServiceUUID[];
}

interface Bluetooth {
  requestDevice(options: RequestDeviceOptions): Promise<BluetoothDevice>;
}

interface Navigator {
  bluetooth?: Bluetooth;
}
