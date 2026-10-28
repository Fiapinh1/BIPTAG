import { useEffect, useRef, useState } from 'react';
import type { HHR5000Reader } from '../hooks/useHHR5000';
import { BluetoothIcon, PhoneIcon } from '../icons/Icons';
import { startNfcReader } from '../services/nfc';
import { describeReaderError } from '../services/reader-access';
import { chromeReaderUrl, getReaderEnvironment, readNfcPermission, type NfcPermission } from '../services/reader-environment';
import { ReaderHelp } from './ReaderHelp';
import { BluetoothReadDiagnostics, bluetoothDiagnosticText } from './BluetoothReadDiagnostics';

const permissionLabels: Record<NfcPermission, string> = {
  granted: 'Permitida neste site', denied: 'Bloqueada nas permissões do site',
  prompt: 'Aguardando sua autorização', unknown: 'O navegador não informou o estado da permissão'
};

export function ReaderPermissionsPanel({ reader }: { reader: HHR5000Reader }) {
  const [environment, setEnvironment] = useState(getReaderEnvironment);
  const [permission, setPermission] = useState<NfcPermission>('unknown');
  const [nfcState, setNfcState] = useState<'off' | 'starting' | 'active'>('off');
  const [nfcMessage, setNfcMessage] = useState('Toque para solicitar acesso e testar o NFC deste celular.');
  const [nfcError, setNfcError] = useState<string | null>(null);
  const [lastNfcTag, setLastNfcTag] = useState<string | null>(null);
  const [copyMessage, setCopyMessage] = useState('');
  const attempt = useRef<AbortController | null>(null);
  const stopNfc = useRef<(() => void) | null>(null);
  const mounted = useRef(true);
  const permissionRead = useRef(0);

  async function refreshPermission() {
    const read = ++permissionRead.current;
    const value = await readNfcPermission();
    if (mounted.current && permissionRead.current === read) setPermission(value);
  }

  useEffect(() => {
    mounted.current = true;
    const refresh = () => {
      setEnvironment(getReaderEnvironment());
      void refreshPermission();
    };
    refresh();
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      mounted.current = false;
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
      attempt.current?.abort();
      stopNfc.current?.();
    };
  }, []);

  function stopTest() {
    attempt.current?.abort(); attempt.current = null;
    stopNfc.current?.(); stopNfc.current = null;
    setNfcState('off');
    setNfcMessage('Teste parado. Você pode ativar novamente.');
  }

  async function testNfc() {
    if (attempt.current && !attempt.current.signal.aborted && !stopNfc.current) return;
    attempt.current?.abort(); stopNfc.current?.(); stopNfc.current = null;
    const controller = new AbortController(); attempt.current = controller;
    setNfcState('starting'); setNfcError(null);
    setNfcMessage('Aguardando o navegador. Se aparecer uma permissão, toque em Permitir.');
    try {
      // Keep scan() in the button gesture: do not await a permission query first.
      const stop = await startNfcReader((result) => {
        setLastNfcTag(result.tagNumber); setNfcMessage('Tag recebida. O NFC deste acesso está funcionando.');
        setNfcError(null);
      }, setNfcError, controller.signal);
      if (controller.signal.aborted || !mounted.current) { stop(); return; }
      stopNfc.current = stop; setNfcState('active');
      setNfcMessage('NFC ativado. Encoste uma tag compatível para testar. Este teste não registra uma conferência.');
    } catch (error) {
      if (controller.signal.aborted || !mounted.current) return;
      setNfcState('off'); setNfcError(describeReaderError(error, 'nfc').message);
    } finally {
      if (mounted.current && attempt.current === controller) {
        if (!stopNfc.current) attempt.current = null;
        void refreshPermission();
      }
    }
  }

  const diagnostics = [
    `BIPTAG — acesso aos leitores`, `Navegador: ${environment.browser}`,
    `Abertura: ${environment.installed ? 'ícone instalado' : 'navegador'}`,
    `HTTPS/contexto seguro: ${environment.secure ? 'sim' : 'não'}`,
    `Página principal: ${environment.topLevel ? 'sim' : 'não'}`,
    `Bluetooth no navegador: ${environment.bluetoothSupported ? 'disponível' : 'indisponível'}`,
    `Bastão: ${reader.status} — ${reader.message}`,
    bluetoothDiagnosticText(reader),
    `NFC no navegador: ${environment.nfcSupported ? 'disponível' : 'indisponível'}`,
    `Permissão NFC: ${environment.nfcSupported ? permissionLabels[permission] : 'NFC indisponível neste navegador'}`,
    ...(nfcError ? [`Erro NFC: ${nfcError}`] : [])
  ].join('\n');

  async function copyDiagnostics() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(diagnostics);
      setCopyMessage('Diagnóstico copiado.');
    } catch { setCopyMessage('Não foi possível copiar. Você pode enviar um print deste diagnóstico.'); }
  }

  return <section className="reader-permissions" aria-labelledby="reader-permissions-title">
    <div><span className="eyebrow">NESTE CELULAR</span><h2 id="reader-permissions-title">Acesso aos leitores</h2>
      <p>Cada celular precisa autorizar os leitores. O navegador mostra o pedido ao tocar nos botões abaixo, quando necessário.</p>
      <small>{environment.browser} · {environment.installed ? 'Aberto pelo ícone instalado' : 'Aberto no navegador'}</small>
    </div>
    {(!environment.bluetoothSupported || !environment.nfcSupported) && <div className="reader-permissions__notice">
      Este acesso não disponibilizou {!environment.bluetoothSupported && !environment.nfcSupported ? 'Bluetooth nem NFC' : !environment.nfcSupported ? 'NFC' : 'Bluetooth'} para o app. Isso é diferente de uma permissão negada.
    </div>}
    {environment.android && (environment.installed || !environment.bluetoothSupported || !environment.nfcSupported) && <a className="button button--ghost" href={chromeReaderUrl(window.location.origin)}>Abrir BIPTAG no Chrome para revisar permissões</a>}
    <div className="reader-permissions__grid">
      <section className="reader-permissions__device" aria-label="Permissão do bastão Bluetooth">
        <h3><BluetoothIcon size={23} /> Bastão Bluetooth</h3>
        <p role="status">{reader.status === 'conectado' ? 'Bastão autorizado e conectado' : reader.message}</p>
        {reader.readError && <p className="reader-permissions__error" role="alert">{reader.readError}</p>}
        <button className="button button--primary button--full" disabled={!environment.bluetoothSupported || reader.status === 'conectando'} onClick={() => void reader.chooseDevice()}>{reader.status === 'conectando' ? 'Conectando…' : 'Autorizar e selecionar bastão'}</button>
        <button className="button button--ghost button--full" disabled={!environment.bluetoothSupported || reader.status === 'conectando'} onClick={() => void reader.chooseDevice(true)}>Bastão não aparece? Procurar todos</button>
        {['conectado', 'conectando'].includes(reader.status) && <button className="button button--ghost" onClick={reader.disconnect}>{reader.status === 'conectando' ? 'Cancelar conexão' : 'Desconectar bastão'}</button>}
        <small>Deixe o bastão ligado e próximo. Desconecte-o do outro celular antes de procurar neste.</small>
        {reader.lastTagRead && <p className="reader-permissions__last">Última tag recebida: <strong>{reader.lastTagRead}</strong></p>}
        <ReaderHelp mode="bluetooth" />
        <BluetoothReadDiagnostics reader={reader} />
      </section>
      <section className="reader-permissions__device" aria-label="Permissão do NFC">
        <h3><PhoneIcon size={23} /> NFC do celular</h3>
        <p>{environment.nfcSupported ? permissionLabels[permission] : 'Este navegador não disponibilizou leitura NFC.'}</p>
        {environment.nfcSupported && <p role="status">{nfcMessage}</p>}
        {nfcError && <p className="reader-permissions__error" role="alert">{nfcError}</p>}
        <button className="button button--primary button--full" disabled={!environment.nfcSupported || nfcState === 'starting'} onClick={() => void testNfc()}>{nfcState === 'starting' ? 'Aguardando autorização…' : nfcState === 'active' ? 'Reiniciar teste NFC' : 'Autorizar e testar NFC'}</button>
        {nfcState !== 'off' && <button className="button button--ghost" onClick={stopTest}>{nfcState === 'starting' ? 'Cancelar ativação do NFC' : 'Parar teste NFC'}</button>}
        {lastNfcTag && <p className="reader-permissions__last">Tag recebida: <strong>{lastNfcTag}</strong></p>}
        <ReaderHelp mode="phone" />
      </section>
    </div>
    <details className="reader-permissions__diagnostic"><summary>Ver diagnóstico deste acesso</summary><pre>{diagnostics}</pre>
      <button className="button button--ghost" onClick={() => void copyDiagnostics()}>Copiar diagnóstico</button>
      {copyMessage && <p role="status">{copyMessage}</p>}
    </details>
  </section>;
}
