import { useCallback, useEffect, useRef, useState } from 'react';
import { connectHHR5000, isWebBluetoothSupported, type HHR5000Connection } from '../services/hhr5000';

export type HHR5000Status = 'desconectado' | 'conectando' | 'conectado' | 'erro';

export function useHHR5000(onTagRead: (tagNumber: string, rawValue: string) => void) {
  const [status, setStatus] = useState<HHR5000Status>('desconectado');
  const [message, setMessage] = useState('HHR5000SN desconectado');
  const [lastTagRead, setLastTagRead] = useState<string | null>(null);
  const connectionRef = useRef<HHR5000Connection | null>(null);
  const onTagReadRef = useRef(onTagRead);

  useEffect(() => {
    onTagReadRef.current = onTagRead;
  }, [onTagRead]);

  const disconnect = useCallback(() => {
    connectionRef.current?.disconnect();
    connectionRef.current = null;
    setStatus('desconectado');
    setMessage('HHR5000SN desconectado');
  }, []);

  const connect = useCallback(async () => {
    if (!isWebBluetoothSupported()) {
      setStatus('erro');
      setMessage('Web Bluetooth indisponivel neste navegador.');
      return;
    }

    try {
      connectionRef.current?.disconnect();
      connectionRef.current = null;
      setStatus('conectando');
      setMessage('Conectando ao HHR5000SN...');

      connectionRef.current = await connectHHR5000(
        (result) => {
          setLastTagRead(result.tagNumber);
          setMessage(`Ultima tag lida: ${result.tagNumber}`);
          onTagReadRef.current(result.tagNumber, result.rawValue);
        },
        () => {
          connectionRef.current = null;
          setStatus('desconectado');
          setMessage('HHR5000SN desconectado');
        }
      );

      setStatus('conectado');
      setMessage(`${connectionRef.current.deviceName} conectado`);
    } catch (err) {
      connectionRef.current = null;
      setStatus('erro');
      setMessage(err instanceof Error ? err.message : 'Nao foi possivel conectar ao HHR5000SN.');
    }
  }, []);

  useEffect(() => disconnect, [disconnect]);

  return {
    status,
    message,
    lastTagRead,
    isSupported: isWebBluetoothSupported(),
    connect,
    disconnect
  };
}
