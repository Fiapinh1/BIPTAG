import { useEffect, useRef, useState, type RefObject } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import type { HHR5000Reader } from '../hooks/useHHR5000';
import type { RegisteredTag, RegistrationFarm } from '../types/registration';
import { createRegistrationFarm, registrationTagError, saveRegisteredTag } from '../services/tag-registration';
import { exportRegistrationWorkbook } from '../services/registration-export';
import { isWebNfcSupported, startNfcReader } from '../services/nfc';
import { describeReaderError } from '../services/reader-access';
import { feedbackCorrect, feedbackWarning } from '../services/feedback';
import { scrollPageToTop } from '../services/page-scroll';
import { ArrowLeftIcon, CheckIcon, ChevronRightIcon, CowIcon, DownloadIcon, KeyboardIcon, PhoneIcon, PlusIcon, SearchIcon, StickReaderIcon, TagIcon } from '../icons/Icons';
import { HHR5000Connector } from './HHR5000Connector';
import { NfcReadDiagnostics } from './NfcReadDiagnostics';
import { RegistrationManualTag } from './RegistrationManualTag';

export function RegistrationDirectory({ onOpen }: { onOpen: (id: string) => void }) {
  const farms = useLiveQuery(() => db.registrationFarms.orderBy('updatedAt').reverse().toArray(), [], []);
  const tags = useLiveQuery(() => db.registeredTags.toArray(), [], []);
  const countByFarm = new Map<string, number>();
  tags.forEach((tag) => countByFarm.set(tag.farmId, (countByFarm.get(tag.farmId) ?? 0) + 1));
  if (!farms.length) return null;
  return <section className="registration-directory" aria-labelledby="registration-directory-title">
    <div className="registration-section-heading"><h2 id="registration-directory-title">Cadastros de tags</h2><span>Sem planilha</span></div>
    <ul>{farms.map((farm) => <li key={farm.id}><button onClick={() => onOpen(farm.id)}>
      <span className="registration-farm-icon"><TagIcon /></span><span><strong>{farm.name}</strong><small>{countByFarm.get(farm.id) ?? 0} {(countByFarm.get(farm.id) ?? 0) === 1 ? 'animal cadastrado' : 'animais cadastrados'}</small></span><ChevronRightIcon />
    </button></li>)}</ul>
    <small className="registration-local-note">Cadastros salvos neste aparelho. Exporte a planilha para compartilhar.</small>
  </section>;
}

type Props = {
  farmId: string | null;
  farmNames: string[];
  onSelectFarm: (id: string) => void;
  onHome: () => void;
  reader: HHR5000Reader;
  bluetoothReadHandler: RefObject<((tag: string, raw: string) => void) | null>;
  confirm: (title: string, message: string) => Promise<boolean>;
};

export function TagRegistration(props: Props) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const farms = useLiveQuery(() => db.registrationFarms.orderBy('updatedAt').reverse().toArray(), [], []);
  const farm = useLiveQuery(async () => props.farmId ? await db.registrationFarms.get(props.farmId) : undefined, [props.farmId]);

  async function openFarm() {
    if (creating) return;
    setCreating(true); setError('');
    try { props.onSelectFarm((await createRegistrationFarm(name)).id); }
    catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível criar a fazenda. Tente novamente.'); }
    finally { setCreating(false); }
  }

  if (farm) return <RegistrationWorkspace key={farm.id} {...props} farm={farm} />;
  return <section className="registration-setup">
    <span className="registration-setup__icon"><TagIcon size={30} /></span>
    <span className="eyebrow">CADASTRO INICIAL</span><h1>Novas tags, direto no campo.</h1>
    <p>Escolha a fazenda e vincule cada tag ao animal. Comece sem importar uma planilha.</p>
    <form className="registration-panel" onSubmit={(event) => { event.preventDefault(); void openFarm(); }}>
      <label htmlFor="registration-farm">Em qual fazenda?</label>
      <input id="registration-farm" className="text-input" placeholder="Nome da fazenda" value={name} maxLength={100} required list="registration-farm-names" onChange={(event) => setName(event.target.value)} />
      <datalist id="registration-farm-names">{[...new Set(props.farmNames)].map((item) => <option value={item} key={item} />)}</datalist>
      {error && <p className="registration-error" role="alert">{error}</p>}
      <button className="button button--primary button--full" disabled={creating || !name.trim()}>{creating ? 'Preparando…' : 'Começar cadastro'}<ChevronRightIcon size={18} /></button>
    </form>
    {farms.length > 0 && <RegistrationDirectory onOpen={props.onSelectFarm} />}
    <p className="registration-local-note">O cadastro fica salvo neste aparelho, mesmo sem internet. Depois, exporte os vínculos para usar no sistema da fazenda.</p>
  </section>;
}

type Mode = 'manual' | 'phone' | 'bluetooth';
type Draft = { tagNumber: string; animal: string; source: RegisteredTag['source'] };
const emptyDraft: Draft = { tagNumber: '', animal: '', source: 'manual' };
const draftKey = (id: string) => `biptag-registration-draft-${id}`;
function restoreDraft(id: string): Draft {
  try {
    const value = JSON.parse(localStorage.getItem(draftKey(id)) ?? 'null');
    if (typeof value?.tagNumber === 'string' && typeof value.animal === 'string' && ['manual', 'nfc', 'bluetooth'].includes(value.source)) return value;
  } catch { /* The saved registrations remain in IndexedDB. */ }
  return { ...emptyDraft };
}

function RegistrationWorkspace({ farm, reader, bluetoothReadHandler, onHome, confirm }: Props & { farm: RegistrationFarm }) {
  const records = useLiveQuery(() => db.registeredTags.where('farmId').equals(farm.id).sortBy('updatedAt').then((items) => items.reverse()), [farm.id], []);
  const [tab, setTab] = useState<'register' | 'list'>('register');
  const [mode, setMode] = useState<Mode>('manual');
  const [draft, setDraft] = useState<Draft>(() => restoreDraft(farm.id));
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saved, setSaved] = useState<RegisteredTag | null>(null);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState('');
  const [readerOpen, setReaderOpen] = useState(false);
  const [nfc, setNfc] = useState<'off' | 'starting' | 'on'>('off');
  const [editing, setEditing] = useState<RegisteredTag | null>(null);
  const [correctionAnimal, setCorrectionAnimal] = useState('');
  const [correctionTag, setCorrectionTag] = useState('');
  const animalInput = useRef<HTMLInputElement>(null);
  const tagInput = useRef<HTMLInputElement>(null);
  const nfcAttempt = useRef<AbortController | null>(null);
  const stopNfc = useRef<(() => void) | null>(null);
  const savingRef = useRef(false);
  const latest = useRef({ mode, draft, records, tab, editing, readerOpen });
  latest.current = { mode, draft, records, tab, editing, readerOpen };

  function changeDraft(next: Draft) {
    latest.current.draft = next;
    setDraft(next);
    try {
      if (next.tagNumber || next.animal) localStorage.setItem(draftKey(farm.id), JSON.stringify(next));
      else localStorage.removeItem(draftKey(farm.id));
    } catch { setError('Não foi possível guardar o rascunho. Salve o vínculo antes de sair.'); }
  }

  function receive(tagNumber: string, source: RegisteredTag['source']) {
    const current = latest.current;
    if (savingRef.current || current.tab !== 'register' || current.editing || current.readerOpen) return;
    if (current.draft.tagNumber) {
      if (current.draft.tagNumber !== tagNumber) setNotice('Conclua o vínculo atual antes de ler outra tag.');
      return;
    }
    const invalid = registrationTagError(tagNumber);
    if (invalid) { setError(invalid); feedbackWarning(); return; }
    const existing = current.records.find((item) => item.tagNumber === tagNumber);
    if (existing) { setError(`Esta tag já está cadastrada no animal ${existing.animal}. Consulte a aba Cadastros para corrigir.`); feedbackWarning(); return; }
    setError(''); setNotice(''); setSaved(null);
    changeDraft({ tagNumber, animal: current.draft.animal, source });
    animalInput.current?.focus({ preventScroll: true });
  }

  useEffect(() => {
    bluetoothReadHandler.current = (tag) => { if (latest.current.mode === 'bluetooth') receive(tag, 'bluetooth'); };
    return () => { bluetoothReadHandler.current = null; };
  });
  useEffect(() => () => { nfcAttempt.current?.abort(); stopNfc.current?.(); }, []);
  useEffect(() => {
    if (mode !== 'phone' || tab !== 'register' || editing) deactivateNfc();
  }, [mode, tab, Boolean(editing)]);
  useEffect(() => { scrollPageToTop(); }, [tab]);

  function deactivateNfc() {
    nfcAttempt.current?.abort(); nfcAttempt.current = null;
    stopNfc.current?.(); stopNfc.current = null; setNfc('off');
  }

  async function activateNfc() {
    deactivateNfc();
    const controller = new AbortController(); nfcAttempt.current = controller;
    setNfc('starting'); setError('');
    try {
      const stop = await startNfcReader((result) => {
        if (latest.current.mode === 'phone') receive(result.tagNumber, 'nfc');
      }, setError, controller.signal);
      if (controller.signal.aborted) { stop(); return; }
      stopNfc.current = stop; setNfc('on');
    } catch (err) {
      if (!controller.signal.aborted) { setError(describeReaderError(err, 'nfc').message); setNfc('off'); }
    }
  }

  async function save() {
    if (savingRef.current) return;
    savingRef.current = true; setSaving(true); setError('');
    try {
      const record = await saveRegisteredTag({ farmId: farm.id, ...latest.current.draft });
      changeDraft({ ...emptyDraft }); setSaved(record); setNotice(''); feedbackCorrect();
      if (mode === 'manual') tagInput.current?.focus({ preventScroll: true });
      else animalInput.current?.blur();
    } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível salvar. Seus dados continuam na tela.'); feedbackWarning(); }
    finally { savingRef.current = false; setSaving(false); }
  }

  async function clearDraft() {
    if (draft.animal && !await confirm('Limpar esta leitura?', 'O vínculo atual ainda não foi salvo. Deseja limpar a tag e o brinco informados?')) return;
    changeDraft({ ...emptyDraft }); setError(''); setNotice('');
  }

  async function saveCorrection() {
    if (!editing || savingRef.current) return;
    // Lock reader events and repeated taps while the confirmation is open.
    savingRef.current = true; setSaving(true); setError('');
    try {
      if (!await confirm('Confirmar correção?', `Vínculo atual: tag ${editing.tagNumber}, animal ${editing.animal}. Novo vínculo: tag ${correctionTag.trim()}, animal ${correctionAnimal.trim()}.`)) return;
      await saveRegisteredTag({ farmId: farm.id, tagNumber: correctionTag, animal: correctionAnimal, source: editing.source,
        correction: { id: editing.id, expectedUpdatedAt: editing.updatedAt } });
      setEditing(null); setNotice('Vínculo corrigido e salvo neste aparelho.');
    } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível corrigir o vínculo.'); }
    finally { savingRef.current = false; setSaving(false); }
  }

  const filtered = records.filter((item) => item.tagNumber.includes(query.trim()) || item.animal.includes(query.trim()));
  const ready = mode === 'phone' ? nfc === 'on' : mode === 'bluetooth' && reader.status === 'conectado';
  const manualEntry = mode === 'manual' && (!draft.tagNumber || draft.source === 'manual');
  const draftPattern = draft.source === 'manual' ? farm.manualTagPattern : undefined;
  const correctionInvalid = editing && correctionTag !== editing.tagNumber ? registrationTagError(correctionTag, editing.source === 'manual' ? farm.manualTagPattern : undefined) : null;
  return <section className="registration-workspace">
    <div className="registration-chrome">
    <header className="registration-header">
      <button className="registration-back" onClick={onHome}><ArrowLeftIcon size={19} /><span>Início</span></button>
      <div><span>CADASTRO DE TAGS</span><h1>{farm.name}</h1></div>
      {mode === 'bluetooth' ? <HHR5000Connector reader={reader} open={readerOpen} onOpenChange={setReaderOpen} /> : <span className="registration-count" aria-label={`${records.length} ${records.length === 1 ? 'animal cadastrado' : 'animais cadastrados'}`}><strong>{records.length}</strong><small>{records.length === 1 ? 'animal' : 'animais'}</small></span>}
    </header>
    <div className="registration-tabs" role="group" aria-label="Páginas do cadastro">
      <button aria-pressed={tab === 'register'} onClick={() => { setTab('register'); setError(''); setNotice(''); }}><PlusIcon size={18} />Cadastrar</button>
      <button aria-pressed={tab === 'list'} onClick={() => { setTab('list'); setError(''); setNotice(''); }}><TagIcon size={18} />Cadastros <span>{records.length}</span></button>
    </div>
    </div>
    <div className="registration-body">
      {tab === 'register' ? <>
        <div className="registration-intro"><h2>Vincular tag ao animal</h2><p>Leia a tag e informe o brinco que está vendo.</p></div>
        <div className="registration-modes" role="group" aria-label="Forma de leitura">
          {([{ id: 'manual', title: 'Digitar', icon: <KeyboardIcon size={21} /> }, { id: 'phone', title: 'NFC celular', icon: <PhoneIcon size={21} /> }, { id: 'bluetooth', title: 'Bastão', icon: <StickReaderIcon size={21} /> }] as const).map((item) => <button key={item.id} aria-pressed={mode === item.id} disabled={saving} onClick={() => { setMode(item.id); setError(''); setNotice(''); }}>{item.icon}{item.title}</button>)}
        </div>
        {saved && <div className="registration-success" role="status"><CheckIcon size={22} /><span><strong>Animal {saved.animal} cadastrado</strong><small>Tag {saved.tagNumber} · Salvo neste aparelho</small></span></div>}
        <form className="registration-panel registration-form" onSubmit={(event) => { event.preventDefault(); void save(); }}>
          <div className="registration-field-heading"><span>1</span><label htmlFor="new-registration-tag">SmartTag</label>{mode !== 'manual' && <small className={ready ? 'is-ready' : ''}>{ready ? 'Leitor ativo' : 'Leitor desativado'}</small>}</div>
          {manualEntry ? <RegistrationManualTag farm={farm} value={draft.tagNumber} inputRef={tagInput} disabled={saving} onError={setError} onChange={(tagNumber) => { changeDraft({ ...draft, tagNumber, source: 'manual' }); setError(''); }} /> : <>
            <div id="new-registration-tag" className={`registration-read-value ${draft.tagNumber ? 'has-tag' : ''}`} role="status">{draft.tagNumber ? <><TagIcon size={20} /><strong>{draft.tagNumber}</strong></> : <><span className="registration-read-symbol">{mode === 'phone' ? <PhoneIcon size={28} /> : <StickReaderIcon size={28} />}</span><strong>{ready ? 'Aproxime a tag' : mode === 'phone' ? 'Ative o NFC para ler' : 'Conecte o bastão para ler'}</strong></>}</div>
            {!draft.tagNumber && mode === 'phone' && <button type="button" className="button button--ghost button--full" disabled={!isWebNfcSupported() || nfc === 'starting'} onClick={() => void activateNfc()}>{nfc === 'starting' ? 'Aguardando permissão…' : nfc === 'on' ? 'Reiniciar NFC' : 'Ativar NFC do celular'}</button>}
            {!draft.tagNumber && mode === 'bluetooth' && !ready && <button type="button" className="button button--ghost button--full" disabled={!reader.isSupported || reader.status === 'conectando'} onClick={() => void reader.connect()}>{reader.status === 'conectando' ? 'Conectando…' : 'Conectar bastão'}</button>}
            {mode === 'phone' && nfc === 'starting' && <button type="button" className="registration-text-button" onClick={deactivateNfc}>Cancelar ativação</button>}
            {mode === 'phone' && !isWebNfcSupported() && <p className="registration-field-hint">NFC indisponível neste acesso. Use Chrome no Android em HTTPS ou escolha outra forma de leitura.</p>}
            {mode === 'bluetooth' && !reader.isSupported && <p className="registration-field-hint">Bluetooth indisponível neste acesso. Use Chrome ou Edge em HTTPS ou escolha outra forma de leitura.</p>}
          </>}
          <div className="registration-field-heading"><span>2</span><label htmlFor="new-registration-animal">Número do brinco</label></div>
          <input ref={animalInput} id="new-registration-animal" className="text-input registration-animal-input" placeholder="Ex.: 751" inputMode="numeric" pattern="[0-9]+" maxLength={30} autoComplete="off" required value={draft.animal} disabled={saving} onChange={(event) => { changeDraft({ ...draft, animal: event.target.value.replace(/[^0-9]/g, '') }); setError(''); }} />
          <small className="registration-field-hint">Confira o número no animal antes de salvar.</small>
          {error && <p className="registration-error" role="alert">{error}</p>}
          {notice && <p className="registration-notice" role="status">{notice}</p>}
          {mode === 'bluetooth' && reader.readError && <p className="registration-error" role="alert">{reader.readError}</p>}
          <button className="button button--primary button--full registration-save" disabled={saving || Boolean(registrationTagError(draft.tagNumber, draftPattern)) || !draft.animal.trim()}><CheckIcon size={20} />{saving ? 'Salvando…' : 'Salvar e adicionar próximo'}</button>
          {(draft.tagNumber || draft.animal) && <button type="button" className="registration-text-button" disabled={saving} onClick={() => void clearDraft()}>Limpar leitura atual</button>}
        </form>
        {mode === 'phone' && <details className="registration-help"><summary>Ajuda com NFC</summary><p>Leia tags compatíveis com conteúdo NDEF. O app não grava nem altera a tag.</p>{nfc === 'on' && <button className="button button--ghost" onClick={deactivateNfc}>Parar NFC</button>}<NfcReadDiagnostics /></details>}
        <p className="registration-local-note"><CheckIcon size={14} />Cada vínculo confirmado é salvo neste aparelho.</p>
      </> : <>
        <div className="registration-list-heading"><div><h2>Animais cadastrados</h2><p>{records.length} {records.length === 1 ? 'vínculo' : 'vínculos'} nesta fazenda</p></div><button className="registration-icon-button" aria-label="Exportar cadastros em Excel" disabled={!records.length} onClick={() => { try { exportRegistrationWorkbook(farm, records); } catch { setError('Não foi possível exportar. Tente novamente.'); } }}><DownloadIcon size={20} /><span>Exportar</span></button></div>
        <label className="registration-search"><SearchIcon size={19} /><input aria-label="Buscar tag ou animal cadastrado" type="search" placeholder="Buscar tag ou animal" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
        {error && <p className="registration-error" role="alert">{error}</p>}{notice && <p className="registration-success" role="status">{notice}</p>}
        {filtered.length ? <ul className="registration-records">{filtered.map((record) => <li key={record.id}><span className="registration-record-animal"><CowIcon size={20} /><span><small>ANIMAL</small><strong>{record.animal}</strong></span></span><button onClick={() => { setError(''); setEditing(record); setCorrectionAnimal(record.animal); setCorrectionTag(record.tagNumber); }}>Corrigir</button><div className="registration-record-tag"><TagIcon size={16} /><span>{record.tagNumber}</span></div><small className="registration-record-date">{new Date(record.createdAt).toLocaleString('pt-BR')}{record.corrections.length > 0 ? ' · Corrigido' : ''}</small></li>)}</ul> : <div className="registration-empty"><TagIcon size={30} /><h3>{query ? 'Nenhum vínculo encontrado' : 'Seu primeiro vínculo começa aqui'}</h3><p>{query ? 'Tente outro número de tag ou animal.' : 'Leia uma tag e informe o brinco para montar o cadastro da fazenda.'}</p>{!query && <button className="button button--primary" onClick={() => setTab('register')}>Cadastrar primeira tag</button>}</div>}
        <p className="registration-local-note">A exportação contém SmartTag, animal e data do cadastro. Para cadastrar no Nedap, utilize o processo de importação do sistema da fazenda.</p>
      </>}
    </div>
    {editing && <div className="app-modal" role="dialog" aria-modal="true" aria-labelledby="registration-correction-title"><form className="app-modal__panel registration-correction" onSubmit={(event) => { event.preventDefault(); void saveCorrection(); }}>
      <div className="app-modal__header"><h2 id="registration-correction-title">Corrigir vínculo</h2><button type="button" className="app-modal__close" disabled={saving} aria-label="Fechar correção" onClick={() => { setEditing(null); setError(''); }}>×</button></div>
      <label htmlFor="registration-correction-tag">Número correto da SmartTag</label><input id="registration-correction-tag" className="text-input" inputMode="numeric" pattern="[0-9]+" maxLength={30} value={correctionTag} required disabled={saving} onChange={(event) => setCorrectionTag(event.target.value.replace(/[^0-9]/g, ''))} />
      <label htmlFor="registration-correction-animal">Número correto do brinco</label><input autoFocus id="registration-correction-animal" className="text-input" inputMode="numeric" pattern="[0-9]+" maxLength={30} value={correctionAnimal} required disabled={saving} onChange={(event) => setCorrectionAnimal(event.target.value.replace(/[^0-9]/g, ''))} />
      {error && <p className="registration-error" role="alert">{error}</p>}
      <button className="button button--primary button--full" disabled={saving || Boolean(correctionInvalid) || !correctionAnimal.trim() || (correctionAnimal.trim() === editing.animal && correctionTag === editing.tagNumber)}>{saving ? 'Salvando…' : 'Salvar correção'}</button>
    </form></div>}
  </section>;
}
