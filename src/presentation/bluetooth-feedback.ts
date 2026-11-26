import type { HHR5000Status } from '../hooks/useHHR5000';

export type BluetoothAlert = { title: string; message: string; tone: 'warning' | 'danger'; reconnect: boolean };
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

// Presentation of existing messages only; never infer the radio's power from API support.
export function bluetoothConnectionAlert(status: HHR5000Status, supported: boolean, message: string): BluetoothAlert | null {
  const text = normalize(message);
  if (!supported) return { title: 'Bluetooth indisponível', message: 'Use um navegador compatível em HTTPS.', tone: 'warning', reconnect: false };
  if (status === 'conectado' || status === 'conectando') return null;
  if (text.includes('bloqueado')) return { title: 'Permissão necessária', message: 'Autorize o Bluetooth e tente conectar.', tone: 'warning', reconnect: false };
  if (/bluetooth.*(desativado|desligado|turned off|powered off)|adapter.*(turned off|powered off)/.test(text)) return { title: 'Bluetooth desativado', message: 'Ative o Bluetooth do aparelho.', tone: 'warning', reconnect: true };
  if (text.includes('nenhum bastao selecionado')) return { title: 'Bastão não selecionado', message: 'Escolha o bastão para conectar.', tone: 'warning', reconnect: false };
  if (text.includes('servico de leitura esperado')) return { title: 'Leitor indisponível', message: 'Confira o bastão selecionado.', tone: 'warning', reconnect: true };
  if (text.includes('nao disponibilizou bluetooth') || text.includes('bluetooth indisponivel')) return { title: 'Bluetooth indisponível', message: 'Confira o navegador e as permissões.', tone: 'warning', reconnect: false };
  if (text.includes('desconectado por voce')) return null;
  if (text.includes('bastao desconectado')) return { title: 'Bastão desconectado', message: 'Reconecte para continuar.', tone: 'warning', reconnect: true };
  if (status === 'erro' || text.includes('nao foi possivel manter a conexao') || text.includes('nao foi possivel conectar')) return { title: 'Falha na conexão', message: 'Tente reconectar o bastão.', tone: 'danger', reconnect: true };
  return null;
}

export function bluetoothReadingAlert(error?: string | null): BluetoothAlert | null {
  if (!error) return null;
  return normalize(error).includes('somente zeros')
    ? { title: 'Tag inválida', message: 'Nenhuma tag registrada. Tente ler novamente.', tone: 'warning', reconnect: false }
    : { title: 'Leitura não reconhecida', message: 'Aproxime o bastão novamente.', tone: 'warning', reconnect: false };
}
