import { useEffect, useRef, useState } from 'react';
import { connectHHR5000, isWebBluetoothSupported, type HHR5000Connection } from '../services/hhr5000';
import { describeReaderError } from '../services/reader-access';

export type HHR5000Status = 'desconectado' | 'conectando' | 'conectado' | 'erro';
const READER_STORAGE_KEY = 'biptag-hhr5000-device';
type SavedReader = { id: string; name: string; autoReconnect: boolean };

function readSavedReader(): SavedReader | null {
  try {
    const saved = JSON.parse(localStorage.getItem(READER_STORAGE_KEY) ?? 'null');
    return typeof saved?.id === 'string' && typeof saved.name === 'string' && typeof saved.autoReconnect === 'boolean' ? saved : null;
  } catch { return null; }
}

function saveReader(reader: SavedReader) {
  try { localStorage.setItem(READER_STORAGE_KEY, JSON.stringify(reader)); } catch { /* Keep the live connection when storage is unavailable. */ }
}

export function useHHR5000(onTagRead: (tagNumber: string, rawValue: string) => void, expectedTagLength = 15) {
  const [status, setStatus] = useState<HHR5000Status>('desconectado');
  const [message, setMessage] = useState('Conecte seu bastão para começar.');
  const [deviceName, setDeviceName] = useState<string | null>(null);
  const [lastTagRead, setLastTagRead] = useState<string | null>(null);
  const onTagReadRef = useRef(onTagRead);
  onTagReadRef.current = onTagRead;
  const expectedTagLengthRef = useRef(expectedTagLength);
  expectedTagLengthRef.current = expectedTagLength;
  const actionsRef = useRef({ connect: async () => {}, chooseDevice: async () => {}, disconnect: () => {} });

  useEffect(() => {
    let disposed = false;
    let saved = readSavedReader();
    let wanted = saved?.autoReconnect === true;
    let attempting = false;
    let generation = 0;
    let device: BluetoothDevice | undefined;
    let connection: HHR5000Connection | null = null;
    let attemptAbort: AbortController | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let retryDelay = 1000;

    function clearRetry() {
      clearTimeout(retryTimer);
      retryTimer = undefined;
    }

    function remember(autoReconnect: boolean) {
      if (!device) return;
      saved = { id: device.id, name: device.name ?? 'HHR5000SN', autoReconnect };
      saveReader(saved);
    }

    function scheduleRetry() {
      if (disposed || !wanted || !device || retryTimer || document.visibilityState === 'hidden') return;
      retryTimer = setTimeout(() => {
        retryTimer = undefined;
        void open(device);
      }, retryDelay);
      retryDelay = Math.min(retryDelay * 2, 15000);
    }

    async function open(knownDevice?: BluetoothDevice) {
      if (disposed || attempting || connection || !wanted) return;
      if (!isWebBluetoothSupported()) {
        setStatus('erro');
        setMessage('Bluetooth indisponível neste acesso. Use Chrome ou Edge em HTTPS.');
        return;
      }
      clearRetry();
      attempting = true;
      const thisGeneration = ++generation;
      const controller = new AbortController();
      attemptAbort = controller;
      setStatus('conectando');
      setMessage(knownDevice ? 'Reconectando ao bastão…' : 'Selecione seu bastão…');
      try {
        const next = await connectHHR5000(
          (result) => {
            if (disposed || !wanted || thisGeneration !== generation) return;
            setLastTagRead(result.tagNumber);
            onTagReadRef.current(result.tagNumber, result.rawValue);
          },
          () => {
            if (disposed || thisGeneration !== generation) return;
            connection = null;
            setStatus('desconectado');
            setMessage('Bastão desconectado. Tentando reconectar…');
            scheduleRetry();
          },
          { device: knownDevice, signal: controller.signal, onDeviceSelected: (selected) => { device = selected; }, getExpectedTagLength: () => expectedTagLengthRef.current }
        );
        if (disposed || !wanted || thisGeneration !== generation) {
          next.disconnect();
          return;
        }
        connection = next;
        device = next.device;
        remember(true);
        retryDelay = 1000;
        setDeviceName(next.deviceName);
        setStatus('conectado');
        setMessage(`${next.deviceName} conectado`);
      } catch (err) {
        if (disposed || !wanted || thisGeneration !== generation) return;
        const problem = describeReaderError(err, 'bluetooth', Boolean(device));
        if (!problem.retryable) wanted = false;
        setStatus(device && problem.retryable ? 'desconectado' : 'erro');
        setMessage(problem.message);
      } finally {
        attempting = false;
        if (attemptAbort === controller) attemptAbort = null;
        if (!connection) scheduleRetry();
      }
    }

    function stop() {
      generation++;
      clearRetry();
      attemptAbort?.abort();
      connection?.disconnect();
      connection = null;
    }

    actionsRef.current = {
      connect: async () => {
        wanted = true;
        retryDelay = 1000;
        await open(device);
      },
      chooseDevice: async () => {
        if (attempting) return;
        stop();
        device = undefined;
        wanted = true;
        await open();
      },
      disconnect: () => {
        wanted = false;
        remember(false);
        stop();
        setStatus('desconectado');
        setMessage('Bastão desconectado por você. Toque em conectar para voltar.');
      }
    };

    async function restore() {
      if (disposed || connection || attempting || !saved || !navigator.bluetooth?.getDevices) return;
      const restoreGeneration = generation;
      try {
        const devices = await navigator.bluetooth.getDevices();
        if (disposed || restoreGeneration !== generation || connection || attempting) return;
        device = devices.find((candidate) => candidate.id === saved?.id);
        if (device) {
          setDeviceName(device.name ?? saved.name);
          if (wanted) await open(device);
        } else {
          setMessage('Toque em conectar para autorizar o bastão novamente.');
        }
      } catch {
        if (!disposed && restoreGeneration === generation) setMessage('Toque em conectar para reencontrar seu bastão.');
      }
    }

    function onVisible() {
      if (document.visibilityState === 'hidden') { clearRetry(); return; }
      if (device && wanted) void open(device);
      else if (!device) void restore();
    }
    document.addEventListener('visibilitychange', onVisible);
    void restore();
    return () => {
      disposed = true;
      wanted = false;
      stop();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return {
    status, message, deviceName, lastTagRead,
    isSupported: isWebBluetoothSupported(),
    connect: () => actionsRef.current.connect(),
    chooseDevice: () => actionsRef.current.chooseDevice(),
    disconnect: () => actionsRef.current.disconnect()
  };
}

export type HHR5000Reader = ReturnType<typeof useHHR5000>;
