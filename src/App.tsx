import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, newId } from './db/db';
import { EmptyState } from './components/EmptyState';
import { StatCard } from './components/StatCard';
import {
  CheckIcon,
  ChevronRightIcon,
  CloudIcon,
  HomeIcon,
  ImportIcon,
  IssuesIcon,
  PauseIcon,
  PlayIcon,
  ReportIcon,
  ScanIcon,
  SwapIcon
} from './icons/Icons';
import { parseNedapWorkbook, exportAuditWorkbook, statusLabel, validateSmartTag } from './services/excel';
import { feedbackCorrect, feedbackWarning, primeFeedbackAudio } from './services/feedback';
import { isWebNfcSupported, startNfcReader } from './services/nfc';
import { isSupabaseConfigured, supabase } from './services/supabase';
import { syncAuditToSupabase } from './services/cloud-sync';
import {
  classifyReading,
  detectReciprocalSwap,
  getAnimalTagContext,
  getCurrentRecord,
  getRelatedContext,
  markPendingTagsNotFound,
  saveReading,
  type AnimalTagContext,
  type RelatedContext
} from './services/audit-engine';
import type {
  Audit,
  AuditRecord,
  EffectiveTagAssignment,
  ImportIssue,
  ImportPreview,
  RecordStatus,
  SmartTagPattern,
  TagAssignment
} from './types/domain';
import type { Session } from '@supabase/supabase-js';

type View = 'home' | 'import' | 'audit' | 'issues' | 'settings';

type ScanState = {
  tagNumber: string;
  rawValue: string;
  assignment: TagAssignment | null;
  existingRecord: AuditRecord | null;
  related: RelatedContext;
  patternWarning: { status: 'suspicious_tag' | 'invalid_tag'; reason: string } | null;
  patternConfirmed: boolean;
  possibleTypo: TagAssignment | null;
  source: 'nfc' | 'manual';
};

type DecisionState = {
  status: Exclude<RecordStatus, 'correct'>;
  observedAnimal: string | null;
  animalTagContext: AnimalTagContext | null;
};

type OutcomeState =
  | {
      kind: 'correct';
      title: string;
      tagNumber: string;
      animal: string;
    }
  | {
      kind: 'issue';
      title: string;
      message: string;
      tagNumber: string;
      expectedAnimal: string | null;
      observedAnimal: string | null;
    }
  | {
      kind: 'swap';
      title: string;
      current: AuditRecord;
      other: AuditRecord;
    };

function BiptagLogo({ className = '' }: { className?: string }) {
  return <img className={className} src="/icons/biptag-logo-192.png" alt="BIPTAG" />;
}

function formatDate(value: string) {
  return new Date(value).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatShortDate(value: string) {
  return new Date(value).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit'
  });
}

function App() {
  const [view, setView] = useState<View>('home');
  const [online, setOnline] = useState(navigator.onLine);
  const [toast, setToast] = useState<string | null>(null);
  const [selectedAuditId, setSelectedAuditId] = useState<string | null>(
    () => localStorage.getItem('biptag-selected-audit')
  );

  const audits = useLiveQuery(() => db.audits.orderBy('createdAt').reverse().toArray(), [], []);

  const selectedAudit = useMemo(() => {
    if (!audits.length) return null;
    return (
      audits.find((audit) => audit.id === selectedAuditId) ??
      audits.find((audit) => audit.status !== 'finished') ??
      audits[0]
    );
  }, [audits, selectedAuditId]);

  useEffect(() => {
    if (!selectedAudit && audits.length) {
      const next = audits.find((audit) => audit.status !== 'finished') ?? audits[0];
      setSelectedAuditId(next.id);
    }
  }, [audits, selectedAudit]);

  useEffect(() => {
    if (selectedAuditId) localStorage.setItem('biptag-selected-audit', selectedAuditId);
  }, [selectedAuditId]);

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    const unlockAudio = () => primeFeedbackAudio();
    window.addEventListener('pointerdown', unlockAudio, { passive: true });
    window.addEventListener('keydown', unlockAudio);
    return () => {
      window.removeEventListener('pointerdown', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  async function chooseAudit(audit: Audit) {
    setSelectedAuditId(audit.id);
    if (audit.status === 'paused') {
      const now = new Date().toISOString();
      await db.audits.update(audit.id, { status: 'in_progress', pausedAt: undefined, updatedAt: now, lastActivityAt: now });
    }
  }

  return (
    <div className={`app-shell app-shell--${view}`}>
      <header className="topbar">
        <button className="brand" onClick={() => setView('home')} aria-label="Ir para início">
          <span className="brand__mark"><BiptagLogo /></span>
          <span>
            <strong>BIPTAG</strong>
            <small>Auditoria de SmartTags</small>
          </span>
        </button>

        <button className={`connection-pill ${online ? 'is-online' : 'is-offline'}`} onClick={() => setView('settings')} title="Status do sistema">
          <span className="connection-pill__dot" />
          {online ? 'Online' : 'Offline'}
        </button>
      </header>

      <main className="main-content">
        {view === 'home' && (
          <HomeView
            audits={audits}
            activeAudit={selectedAudit}
            onSelectAudit={(audit) => void chooseAudit(audit)}
            onNewAudit={() => setView('import')}
            onAudit={async () => {
              if (selectedAudit) await chooseAudit(selectedAudit);
              setView('audit');
            }}
            onIssues={() => setView('issues')}
            setToast={setToast}
          />
        )}
        {view === 'import' && (
          <ImportView
            onCreated={(auditId) => {
              setSelectedAuditId(auditId);
              setToast('Base importada e salva neste aparelho.');
              setView('audit');
            }}
          />
        )}
        {view === 'audit' && (
          <AuditView audit={selectedAudit} onNeedImport={() => setView('import')} setToast={setToast} onPaused={() => setView('home')} />
        )}
        {view === 'issues' && (
          <IssuesView audit={selectedAudit} onNeedImport={() => setView('import')} />
        )}
        {view === 'settings' && <CloudSettingsView activeAudit={selectedAudit} setToast={setToast} />}
      </main>

      <nav className="bottom-nav" aria-label="Navegação principal">
        <NavButton active={view === 'home'} label="Início" icon={<HomeIcon />} onClick={() => setView('home')} />
        <NavButton active={view === 'import'} label="Importar" icon={<ImportIcon />} onClick={() => setView('import')} />
        <NavButton active={view === 'audit'} label="Auditar" icon={<ScanIcon />} onClick={() => setView('audit')} />
        <NavButton active={view === 'issues'} label="Pendências" icon={<IssuesIcon />} onClick={() => setView('issues')} />
      </nav>

      {toast ? <div className="toast">{toast}</div> : null}
    </div>
  );
}

function NavButton({ active, label, icon, onClick }: { active: boolean; label: string; icon: React.ReactNode; onClick: () => void }) {
  return (
    <button className={`nav-button ${active ? 'is-active' : ''}`} onClick={onClick}>
      {icon}
      <span>{label}</span>
    </button>
  );
}

function HomeView({
  audits,
  activeAudit,
  onSelectAudit,
  onNewAudit,
  onAudit,
  onIssues,
  setToast
}: {
  audits: Audit[];
  activeAudit: Audit | null;
  onSelectAudit: (audit: Audit) => void;
  onNewAudit: () => void;
  onAudit: () => void;
  onIssues: () => void;
  setToast: (value: string) => void;
}) {
  const records = useLiveQuery(
    () => activeAudit ? db.auditRecords.where('auditId').equals(activeAudit.id).toArray() : Promise.resolve<AuditRecord[]>([]),
    [activeAudit?.id],
    [] as AuditRecord[]
  );
  const effectiveAssignments = useLiveQuery(
    () => activeAudit ? db.effectiveTagAssignments.where('auditId').equals(activeAudit.id).toArray() : Promise.resolve<EffectiveTagAssignment[]>([]),
    [activeAudit?.id],
    [] as EffectiveTagAssignment[]
  );

  const currentRecords = records.filter((record) => record.isCurrent !== false);
  const metrics = useMemo(() => {
    const correct = currentRecords.filter((record) => record.status === 'correct').length;
    const problems = currentRecords.filter((record) => record.status !== 'correct').length;
    const validEffective = effectiveAssignments.filter((item) => !['suspicious', 'invalid'].includes(item.status));
    const auditedUnique = validEffective.length
      ? validEffective.filter((item) => item.status !== 'pending').length
      : new Set(currentRecords.map((record) => record.tagNumber)).size;
    const total = activeAudit?.validTags ?? activeAudit?.totalTags ?? 0;
    return {
      correct,
      problems,
      auditedUnique,
      pending: Math.max(total - auditedUnique, 0),
      percent: total ? Math.min(Math.round((auditedUnique / total) * 100), 100) : 0
    };
  }, [currentRecords, effectiveAssignments, activeAudit]);

  async function pauseAudit() {
    if (!activeAudit || activeAudit.status === 'finished') return;
    const now = new Date().toISOString();
    await db.audits.update(activeAudit.id, { status: 'paused', pausedAt: now, updatedAt: now, lastActivityAt: now });
    setToast('Auditoria pausada. Você pode continuar outro dia neste aparelho.');
  }

  async function finishAudit() {
    if (!activeAudit || activeAudit.status === 'finished') return;
    const pendingTags = effectiveAssignments.filter((item) => item.status === 'pending');
    if (pendingTags.length) {
      const review = window.confirm(`Existem ${pendingTags.length} SmartTags da base que ainda nao foram localizadas. Revisar tags nao localizadas agora?`);
      if (review) onIssues();
      return;
    }
    const ok = window.confirm(`Finalizar a auditoria de ${activeAudit.farmName}? Os dados continuarão salvos e disponíveis para relatório.`);
    if (!ok) return;
    const now = new Date().toISOString();
    await db.audits.update(activeAudit.id, { status: 'finished', finishedAt: now, updatedAt: now, lastActivityAt: now });
    setToast('Auditoria finalizada e mantida no histórico.');
  }

  if (!activeAudit) {
    return (
      <section className="page page--centered">
        <EmptyState
          icon={<BiptagLogo className="empty-logo" />}
          title="BIPTAG pronto para começar"
          text="Importe o Tags.xlsx original do Nedap. A auditoria ficará salva no aparelho e pode continuar em outro dia."
          action={<button className="button button--primary" onClick={onNewAudit}><ImportIcon /> Nova auditoria</button>}
        />
      </section>
    );
  }

  return (
    <section className="page">
      <div className="hero-card field-hero">
        <div>
          <span className="eyebrow">{activeAudit.status === 'finished' ? 'AUDITORIA FINALIZADA' : activeAudit.status === 'paused' ? 'AUDITORIA PAUSADA' : 'AUDITORIA EM ANDAMENTO'}</span>
          <h1>{activeAudit.farmName}</h1>
          <p>Última atividade: {formatDate(activeAudit.lastActivityAt || activeAudit.updatedAt)}</p>
          <div className="saved-pill"><CheckIcon size={17} /> Salvo neste aparelho</div>
        </div>
        <div className="hero-card__progress">
          <div className="progress-ring" style={{ '--progress': `${metrics.percent * 3.6}deg` } as React.CSSProperties}>
            <div><strong>{metrics.percent}%</strong><small>concluído</small></div>
          </div>
        </div>
      </div>

      <div className="stats-grid field-stats">
        <StatCard label="Processadas" value={metrics.auditedUnique} hint={`${metrics.pending} pendentes`} icon={<CheckIcon />} />
        <StatCard label="Corretas" value={metrics.correct} tone="success" icon={<CheckIcon />} />
        <StatCard label="Ocorrências" value={metrics.problems} tone={metrics.problems ? 'danger' : 'default'} icon={<IssuesIcon />} />
        <StatCard label="Tags válidas" value={activeAudit.validTags ?? activeAudit.totalTags} icon={<ScanIcon />} />
      </div>

      {activeAudit.status !== 'finished' && (
        <button className="field-action field-action--primary" onClick={onAudit}>
          <span className="field-action__icon"><PlayIcon size={30} /></span>
          <span>
            <strong>{activeAudit.status === 'paused' ? 'Retomar auditoria' : 'Continuar auditoria'}</strong>
            <small>Voltar exatamente de onde parou</small>
          </span>
          <ChevronRightIcon />
        </button>
      )}

      <button className="secondary-row" onClick={onIssues}>
        <span><IssuesIcon /> Revisar ocorrências e possíveis trocas</span>
        <strong>{metrics.problems + activeAudit.issueCount}</strong>
      </button>

      {activeAudit.status !== 'finished' && (
        <div className="session-actions">
          <button className="button button--ghost" onClick={pauseAudit}><PauseIcon /> Pausar</button>
          <button className="button button--ghost" onClick={finishAudit}>Finalizar</button>
        </div>
      )}

      {audits.length > 1 && (
        <>
          <div className="section-heading section-heading--compact"><div><span className="eyebrow">HISTÓRICO</span><h2>Auditorias salvas</h2></div></div>
          <div className="audit-history">
            {audits.slice(0, 6).map((audit) => (
              <button key={audit.id} className={`audit-history__item ${audit.id === activeAudit.id ? 'is-selected' : ''}`} onClick={() => onSelectAudit(audit)}>
                <span><strong>{audit.farmName}</strong><small>{formatShortDate(audit.lastActivityAt || audit.updatedAt)} · {audit.status === 'finished' ? 'Finalizada' : audit.status === 'paused' ? 'Pausada' : 'Em andamento'}</small></span>
                <ChevronRightIcon />
              </button>
            ))}
          </div>
        </>
      )}

      <button className="link-button" onClick={onNewAudit}>Criar outra auditoria</button>
    </section>
  );
}

function ImportView({ onCreated }: { onCreated: (auditId: string) => void }) {
  const [farmName, setFarmName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [patternDraft, setPatternDraft] = useState<SmartTagPattern | null>(null);
  const [patternConfirmed, setPatternConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleFile(selected: File | null) {
    setFile(selected);
    setPreview(null);
    setPatternDraft(null);
    setPatternConfirmed(false);
    setError(null);
    if (!selected) return;
    setBusy(true);
    try {
      const nextPreview = await parseNedapWorkbook(selected);
      setPreview(nextPreview);
      setPatternDraft(nextPreview.pattern);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível ler a planilha.');
    } finally {
      setBusy(false);
    }
  }

  async function applyPattern() {
    if (!file || !patternDraft) return;
    setBusy(true);
    setError(null);
    try {
      const nextPreview = await parseNedapWorkbook(file, patternDraft);
      setPreview(nextPreview);
      setPatternDraft(nextPreview.pattern);
      setPatternConfirmed(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nao foi possivel aplicar o padrao.');
    } finally {
      setBusy(false);
    }
  }

  async function saveImport() {
    if (!file || !preview || !farmName.trim() || !patternConfirmed) return;
    setBusy(true);
    try {
      const auditId = newId('audit');
      const now = new Date().toISOString();
      const audit: Audit = {
        id: auditId,
        farmName: farmName.trim(),
        sourceFileName: file.name,
        createdAt: now,
        updatedAt: now,
        lastActivityAt: now,
        startedAt: now,
        status: 'in_progress',
        totalTags: preview.stats.totalTags,
        totalRows: preview.stats.totalRows,
        validTags: preview.stats.validTags,
        suspiciousTags: preview.stats.suspiciousTags,
        invalidTags: preview.stats.invalidTags,
        tagPattern: preview.pattern,
        linkedTags: preview.stats.linkedTags,
        issueCount: preview.issues.length
      };

      const assignmentRows = preview.assignments.map((assignment) => ({ ...assignment, id: newId('tag'), auditId }));
      const effectiveRows = assignmentRows.map((assignment) => ({
        id: newId('effective'),
        auditId,
        tagNumber: assignment.tagNumber,
        originalAnimal: assignment.expectedAnimal,
        effectiveAnimal: assignment.expectedAnimal,
        status: assignment.validationStatus === 'invalid_tag'
          ? 'invalid' as const
          : assignment.validationStatus === 'suspicious_tag'
            ? 'suspicious' as const
            : 'pending' as const,
        sourceAssignmentId: assignment.id,
        currentRecordId: null,
        relatedRecordId: null,
        updatedAt: now,
        syncedAt: null,
        syncStatus: 'pending' as const
      }));

      await db.transaction('rw', db.audits, db.tagAssignments, db.effectiveTagAssignments, db.importIssues, async () => {
        await db.audits.add(audit);
        await db.tagAssignments.bulkAdd(assignmentRows);
        await db.effectiveTagAssignments.bulkAdd(effectiveRows);
        if (preview.issues.length) {
          await db.importIssues.bulkAdd(preview.issues.map((issue) => ({ ...issue, id: newId('issue'), auditId })));
        }
      });
      onCreated(auditId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar a auditoria.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="page">
      <div className="section-heading">
        <div>
          <span className="eyebrow">NOVA AUDITORIA</span>
          <h1>Importar base Nedap</h1>
          <p>Use o <strong>Tags.xlsx original</strong>. Depois de salvar, a auditoria fica persistida no aparelho.</p>
        </div>
      </div>

      <div className="form-card">
        <label className="field-label" htmlFor="farm">Fazenda</label>
        <input id="farm" className="text-input" placeholder="Ex.: Fazenda Santa Juliana" value={farmName} onChange={(event) => setFarmName(event.target.value)} />

        <label className="file-drop">
          <input type="file" accept=".xlsx,.xls" onChange={(event) => handleFile(event.target.files?.[0] ?? null)} />
          <span className="file-drop__icon"><ImportIcon size={30} /></span>
          <strong>{file ? file.name : 'Selecionar Tags.xlsx'}</strong>
          <small>{file ? 'Toque para trocar o arquivo' : 'Arquivo exportado diretamente do Nedap Now'}</small>
        </label>
      </div>

      {busy && <div className="inline-status">Analisando arquivo…</div>}
      {error && <div className="alert alert--danger"><IssuesIcon /> <span>{error}</span></div>}

      {preview && (
        <>
          <div className="section-heading section-heading--compact"><div><span className="eyebrow">PRÉ-VALIDAÇÃO</span><h2>Base reconhecida</h2></div></div>
          <div className="stats-grid">
            <StatCard label="Total de tags" value={preview.stats.totalTags} />
            <StatCard label="Animais vinculados" value={preview.stats.linkedTags} />
            <StatCard label="Tags sem vínculo" value={preview.stats.tagsWithoutAnimal} tone={preview.stats.tagsWithoutAnimal ? 'warning' : 'default'} />
            <StatCard label="Animais multitag" value={preview.stats.animalsWithMultipleTags} tone={preview.stats.animalsWithMultipleTags ? 'warning' : 'default'} />
          </div>
          {patternDraft && (
            <div className="pattern-card">
              <div>
                <span className="eyebrow">PADRAO DAS SMARTTAGS</span>
                <h2>{patternDraft.prefix}</h2>
                <p>Comprimento: {patternDraft.length} digitos. Formato: somente numeros.</p>
              </div>
              <div className="pattern-card__fields">
                <label>
                  <span>Prefixo</span>
                  <input className="text-input" inputMode="numeric" value={patternDraft.prefix} onChange={(event) => { setPatternDraft({ ...patternDraft, prefix: event.target.value.replace(/[^0-9]/g, '') }); setPatternConfirmed(false); }} />
                </label>
                <label>
                  <span>Digitos</span>
                  <input className="text-input" inputMode="numeric" value={patternDraft.length} onChange={(event) => { setPatternDraft({ ...patternDraft, length: Number(event.target.value.replace(/[^0-9]/g, '')) || 0 }); setPatternConfirmed(false); }} />
                </label>
              </div>
              <button className="button button--secondary button--full" disabled={busy || !patternDraft.prefix || !patternDraft.length} onClick={() => void applyPattern()}>
                {patternConfirmed ? 'Padrao confirmado' : 'Confirmar padrao'}
              </button>
            </div>
          )}
          <div className="summary-strip"><span><CheckIcon /> Estrutura Nedap reconhecida</span><span>{preview.stats.duplicateTags} tags duplicadas</span></div>
          <button className="button button--primary button--full button--large" disabled={!farmName.trim() || busy || !patternConfirmed} onClick={saveImport}>Salvar no aparelho e iniciar</button>
        </>
      )}
    </section>
  );
}

function AuditView({
  audit,
  onNeedImport,
  setToast,
  onPaused
}: {
  audit: Audit | null;
  onNeedImport: () => void;
  setToast: (value: string) => void;
  onPaused: () => void;
}) {
  const [readerActive, setReaderActive] = useState(false);
  const [readerMessage, setReaderMessage] = useState('Leitor NFC desativado');
  const [scan, setScan] = useState<ScanState | null>(null);
  const [observedAnimal, setObservedAnimal] = useState('');
  const [manualTag, setManualTag] = useState('');
  const [decision, setDecision] = useState<DecisionState | null>(null);
  const [outcome, setOutcome] = useState<OutcomeState | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const stopReader = useRef<null | (() => void)>(null);
  const lastRead = useRef<{ tag: string; at: number } | null>(null);

  useEffect(() => () => stopReader.current?.(), []);

  const auditRecords = useLiveQuery(
    () => audit ? db.auditRecords.where('auditId').equals(audit.id).toArray() : Promise.resolve<AuditRecord[]>([]),
    [audit?.id],
    [] as AuditRecord[]
  );
  const effectiveAssignments = useLiveQuery(
    () => audit ? db.effectiveTagAssignments.where('auditId').equals(audit.id).toArray() : Promise.resolve<EffectiveTagAssignment[]>([]),
    [audit?.id],
    [] as EffectiveTagAssignment[]
  );

  const fieldMetrics = useMemo(() => {
    const current = auditRecords.filter((record) => record.isCurrent !== false);
    const validEffective = effectiveAssignments.filter((item) => !['suspicious', 'invalid'].includes(item.status));
    const auditedUnique = validEffective.length
      ? validEffective.filter((item) => item.status !== 'pending').length
      : new Set(current.map((record) => record.tagNumber)).size;
    const issues = current.filter((record) => record.status !== 'correct').length;
    const total = audit?.validTags ?? audit?.totalTags ?? 0;
    return {
      auditedUnique,
      issues,
      pending: Math.max(total - auditedUnique, 0),
      percent: total ? Math.min(Math.round((auditedUnique / total) * 100), 100) : 0
    };
  }, [auditRecords, effectiveAssignments, audit]);

  if (!audit) {
    return (
      <section className="page page--centered">
        <EmptyState icon={<ImportIcon size={42} />} title="Nenhuma base importada" text="Importe o Tags.xlsx antes de iniciar a leitura das SmartTags." action={<button className="button button--primary" onClick={onNeedImport}>Importar planilha</button>} />
      </section>
    );
  }

  if (audit.status === 'finished') {
    return (
      <section className="page page--centered">
        <EmptyState icon={<CheckIcon size={42} />} title="Auditoria finalizada" text="Esta auditoria está bloqueada para novas leituras. Os resultados continuam disponíveis em Pendências e no relatório." action={<button className="button button--primary" onClick={onNeedImport}>Criar nova auditoria</button>} />
      </section>
    );
  }

  const activeAudit = audit;

  async function findPossibleTypo(tagNumber: string) {
    const suffix = tagNumber.slice(7);
    const candidates = await db.tagAssignments.where('auditId').equals(activeAudit.id).toArray();
    return candidates.find(
      (candidate) =>
        candidate.validationStatus === 'suspicious_tag' &&
        candidate.tagNumber !== tagNumber &&
        candidate.tagNumber.length === tagNumber.length &&
        candidate.tagNumber.slice(7) === suffix
    ) ?? null;
  }

  async function processRead(tagNumber: string, rawValue = tagNumber, source: 'nfc' | 'manual' = 'nfc') {
    const normalized = tagNumber.replace(/[^0-9]/g, '').trim();
    if (!normalized) return;
    const now = Date.now();
    if (lastRead.current?.tag === normalized && now - lastRead.current.at < 1800) return;
    lastRead.current = { tag: normalized, at: now };

    const [assignment, existingRecord] = await Promise.all([
      db.tagAssignments.where('[auditId+tagNumber]').equals([activeAudit.id, normalized]).first(),
      getCurrentRecord(activeAudit.id, normalized)
    ]);
    const patternCheck = activeAudit.tagPattern ? validateSmartTag(normalized, activeAudit.tagPattern) : null;
    const patternWarning = patternCheck && patternCheck.status !== 'valid_tag'
      ? { status: patternCheck.status, reason: patternCheck.reason }
      : null;
    const [related, possibleTypo] = await Promise.all([
      getRelatedContext(activeAudit.id, assignment ?? null),
      !assignment ? findPossibleTypo(normalized) : Promise.resolve(null)
    ]);

    setObservedAnimal('');
    setDecision(null);
    setOutcome(null);
    setScan({
      tagNumber: normalized,
      rawValue,
      assignment: assignment ?? null,
      existingRecord,
      related,
      patternWarning,
      patternConfirmed: !patternWarning,
      possibleTypo,
      source
    });
    setReaderMessage(`Tag lida: ${normalized}`);
    feedbackCorrect();
  }

  async function activateReader() {
    try {
      primeFeedbackAudio();
      setReaderMessage('Solicitando acesso ao NFC…');
      stopReader.current?.();
      stopReader.current = await startNfcReader(
        (result) => void processRead(result.tagNumber, result.rawValue, 'nfc'),
        (message) => { setReaderMessage(message); feedbackWarning(); }
      );
      setReaderActive(true);
      const now = new Date().toISOString();
      await db.audits.update(activeAudit.id, { status: 'in_progress', pausedAt: undefined, updatedAt: now, lastActivityAt: now });
      setReaderMessage('Leitor ativo. Aproxime uma SmartTag.');
    } catch (err) {
      setReaderActive(false);
      setReaderMessage(err instanceof Error ? err.message : 'Não foi possível ativar o NFC.');
      feedbackWarning();
    }
  }

  function deactivateReader() {
    stopReader.current?.();
    stopReader.current = null;
    setReaderActive(false);
    setReaderMessage('Leitor NFC desativado');
  }

  async function evaluateObserved() {
    if (!scan) return;
    const observed = observedAnimal.trim() || null;
    if (!observed) {
      setToast('Digite o número do brinco ou use “Não consegui confirmar”.');
      return;
    }

    const status = await classifyReading(activeAudit.id, scan.assignment, observed);
    if (status === 'correct') {
      const saved = await saveReading({
        auditId: activeAudit.id,
        tagNumber: scan.tagNumber,
        assignment: scan.assignment,
        expectedAnimal: scan.assignment?.expectedAnimal ?? null,
        observedAnimal: observed,
        status,
        fieldDecision: 'confirmed_match',
        source: scan.source,
        existingRecord: scan.existingRecord
      });
      feedbackCorrect();
      setOutcome({ kind: 'correct', title: 'Conferência correta', tagNumber: saved.tagNumber, animal: observed });
      window.setTimeout(() => resetForNext('Leitura salva. Aproxime a próxima SmartTag.'), 1300);
      return;
    }

    setDecision({ status, observedAnimal: observed, animalTagContext: await getAnimalTagContext(activeAudit.id, observed) });
    feedbackWarning();
  }

  async function confirmPhysicalFact() {
    if (!scan || !decision) return;
    const saved = await saveReading({
      auditId: activeAudit.id,
      tagNumber: scan.tagNumber,
      assignment: scan.assignment,
      expectedAnimal: scan.assignment?.expectedAnimal ?? null,
      observedAnimal: decision.observedAnimal,
      status: decision.status,
      fieldDecision: 'confirmed_physical_animal',
      source: scan.source,
      existingRecord: scan.existingRecord
    });

    if (saved.status === 'divergence' || saved.status === 'reassignment') {
      const swap = await detectReciprocalSwap(saved);
      if (swap) {
        if (swap.kind === 'conflict') {
          setOutcome({
            kind: 'issue',
            title: 'Conflito de auditoria',
            message: swap.message,
            tagNumber: swap.current.tagNumber,
            expectedAnimal: swap.current.expectedAnimal,
            observedAnimal: swap.current.observedAnimal
          });
        } else {
          setOutcome({ kind: 'swap', title: 'Possível troca identificada', current: swap.current, other: swap.other });
        }
        setDecision(null);
        feedbackWarning();
        return;
      }
    }

    setOutcome({
      kind: 'issue',
      title: issueSavedTitle(saved.status),
      message: issueSavedMessage(saved.status, saved.observedAnimal),
      tagNumber: saved.tagNumber,
      expectedAnimal: saved.expectedAnimal,
      observedAnimal: saved.observedAnimal
    });
    setDecision(null);
    feedbackWarning();
  }

  async function couldNotConfirm() {
    if (!scan) return;
    await saveReading({
      auditId: activeAudit.id,
      tagNumber: scan.tagNumber,
      assignment: scan.assignment,
      expectedAnimal: scan.assignment?.expectedAnimal ?? null,
      observedAnimal: observedAnimal.trim() || null,
      status: 'unconfirmed',
      fieldDecision: 'could_not_confirm',
      source: scan.source,
      existingRecord: scan.existingRecord
    });
    setDecision(null);
    setOutcome({
      kind: 'issue',
      title: 'Separado para revisão',
      message: 'Você não precisou decidir o problema agora. O BIPTAG guardou esta leitura nas pendências.',
      tagNumber: scan.tagNumber,
      expectedAnimal: scan.assignment?.expectedAnimal ?? null,
      observedAnimal: observedAnimal.trim() || null
    });
  }

  function correctObservedNumber() {
    setDecision(null);
    focusObservedInput();
  }

  function cancelCurrentRead() {
    resetForNext(readerActive ? 'Leitor ativo. Aproxime a proxima SmartTag.' : 'Leitura cancelada. Voce pode simular outra tag.');
  }

  function focusObservedInput() {
    window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 120);
  }

  function resetForNext(message = 'Pronto para a próxima leitura.') {
    setScan(null);
    setDecision(null);
    setOutcome(null);
    setObservedAnimal('');
    setReaderMessage(readerActive ? 'Leitor ativo. Aproxime a próxima SmartTag.' : message);
  }

  async function manualRead() {
    primeFeedbackAudio();
    const typed = manualTag.replace(/[^0-9]/g, '').trim();
    const prefix = activeAudit.tagPattern?.prefix ?? '';
    const expectedLength = activeAudit.tagPattern?.length ?? 0;
    const tag = prefix && expectedLength && typed.length < expectedLength && !typed.startsWith(prefix)
      ? `${prefix}${typed}`.slice(0, expectedLength)
      : typed;
    if (!tag) return;
    await processRead(tag, tag, 'manual');
    setManualTag('');
  }

  async function pauseAudit() {
    const now = new Date().toISOString();
    deactivateReader();
    await db.audits.update(activeAudit.id, { status: 'paused', pausedAt: now, updatedAt: now, lastActivityAt: now });
    setToast('Auditoria pausada e salva.');
    onPaused();
  }

  const fieldPageClass = [
    'page field-page',
    scan ? 'field-page--scanned' : '',
    decision ? 'field-page--decision' : '',
    outcome ? `field-page--outcome-active field-page--outcome-${outcome.kind}` : ''
  ].filter(Boolean).join(' ');
  const manualPrefix = activeAudit.tagPattern?.prefix ?? '';
  const manualRestLength = Math.max((activeAudit.tagPattern?.length ?? 0) - manualPrefix.length, 0);
  const manualDigits = manualTag.replace(/[^0-9]/g, '');
  const manualPreviewTag = manualPrefix && manualDigits && !manualDigits.startsWith(manualPrefix)
    ? `${manualPrefix}${manualDigits}`.slice(0, activeAudit.tagPattern?.length ?? undefined)
    : manualDigits;

  return (
    <section className={fieldPageClass}>
      <div className="field-session-bar">
        <div><span className="eyebrow">MODO CAMPO</span><strong>{activeAudit.farmName}</strong></div>
        <button className="compact-action" onClick={pauseAudit}><PauseIcon /> Pausar</button>
      </div>

      <div className="field-progress-strip" aria-label="Progresso da auditoria">
        <div><span>Conferidas</span><strong>{fieldMetrics.auditedUnique}</strong></div>
        <div><span>Pendentes</span><strong>{fieldMetrics.pending}</strong></div>
        <div><span>Ocorrencias</span><strong>{fieldMetrics.issues}</strong></div>
        <div><span>Total</span><strong>{activeAudit.validTags ?? activeAudit.totalTags}</strong></div>
      </div>
      <div className="field-progress-bar"><span style={{ width: `${fieldMetrics.percent}%` }} /></div>

      {!scan && !outcome && (
        <div className={`nfc-panel nfc-panel--field ${readerActive ? 'is-active' : ''}`}>
          <div className="nfc-panel__visual"><ScanIcon size={58} /></div>
          <div className="nfc-panel__text">
            <span className="eyebrow">SMARTTAG</span>
            <h1>{readerActive ? 'Aproxime a tag' : 'Pronto para conferir'}</h1>
            <p>{readerMessage}</p>
          </div>
          {!readerActive ? (
            <button className="button button--primary button--full button--field" onClick={activateReader} disabled={!isWebNfcSupported()}><ScanIcon /> Ativar leitor NFC</button>
          ) : (
            <button className="button button--ghost button--full" onClick={deactivateReader}>Parar leitor</button>
          )}
        </div>
      )}

      {!isWebNfcSupported() && !scan && (
        <div className="alert alert--warning"><IssuesIcon /><span>Web NFC indisponível neste acesso. Para a leitura real, use a versão HTTPS no Chrome Android.</span></div>
      )}

      {scan && !outcome && (
        scan.patternWarning && !scan.patternConfirmed ? (
          <div className="field-outcome field-outcome--issue">
            <IssuesIcon size={52} />
            <span className="eyebrow">TAG FORA DO PADRAO ESPERADO</span>
            <h1>Confirmar leitura?</h1>
            <div className="outcome-summary">
              <div><span>Tag lida</span><strong>{scan.tagNumber}</strong></div>
              <div><span>Padrao</span><strong>{activeAudit.tagPattern?.prefix ?? '---'} / {activeAudit.tagPattern?.length ?? '--'} digitos</strong></div>
              <div><span>Motivo</span><strong>{scan.patternWarning.reason}</strong></div>
            </div>
            <button className="button button--primary button--full button--field" onClick={() => setScan({ ...scan, patternConfirmed: true })}>Confirmar tag mesmo assim</button>
            <button className="button button--ghost button--full" onClick={() => resetForNext('Leitura cancelada. Aproxime a proxima SmartTag.')}>Cancelar leitura</button>
          </div>
        ) : (
        <div className="field-conference">
          <div className="field-identifiers">
            <div className="field-id-block field-id-block--tag"><span>TAG LIDA</span><strong>{scan.tagNumber}</strong></div>
            <div className="field-id-block field-id-block--animal"><span>CADASTRO NEDAP</span><strong>{scan.assignment?.expectedAnimal ?? 'SEM VÍNCULO'}</strong></div>
          </div>

          {scan.existingRecord && (
            <div className="context-alert context-alert--warning"><IssuesIcon /><div><strong>Esta tag já foi conferida</strong><span>Resultado anterior: {statusLabel(scan.existingRecord.status)}. A nova confirmação ficará registrada no histórico.</span></div></div>
          )}

          {scan.related.message && (
            <div className="context-alert context-alert--relation"><SwapIcon /><div><strong>Existe uma ocorrência relacionada</strong><span>{scan.related.message} O BIPTAG vai cruzar esta leitura automaticamente.</span></div></div>
          )}

          {scan.possibleTypo && (
            <div className="context-alert context-alert--warning">
              <IssuesIcon />
              <div>
                <strong>Possivel erro de digitacao no cadastro</strong>
                <span>Tag fisica {scan.tagNumber}. Registro suspeito {scan.possibleTypo.tagNumber} no animal {scan.possibleTypo.expectedAnimal ?? 'sem vinculo'}.</span>
              </div>
            </div>
          )}

          {!scan.assignment && <div className="context-alert context-alert--danger"><IssuesIcon /><div><strong>Tag não cadastrada</strong><span>Ela não aparece no arquivo Nedap importado. Confirme apenas o brinco que está vendo.</span></div></div>}
          {scan.assignment && !scan.assignment.expectedAnimal && <div className="context-alert context-alert--warning"><IssuesIcon /><div><strong>Tag sem vínculo</strong><span>A tag existe, mas não possui animal cadastrado. Informe somente o brinco físico.</span></div></div>}

          {!decision ? (
            <div className="field-question">
              <span className="eyebrow">OLHE O ANIMAL</span>
              <h2>Qual número está no brinco?</h2>
              <input
                ref={inputRef}
                id="observed"
                className="animal-input animal-input--field"
                inputMode="numeric"
                enterKeyHint="done"
                pattern="[0-9]*"
                autoComplete="off"
                placeholder="0000"
                value={observedAnimal}
                onChange={(event) => setObservedAnimal(event.target.value.replace(/[^0-9A-Za-z_-]/g, ''))}
                onKeyDown={(event) => { if (event.key === 'Enter') void evaluateObserved(); }}
              />
              <button className="button button--primary button--full button--field" onClick={() => void evaluateObserved()}>Conferir brinco</button>
              <button className="button button--ghost button--full" onClick={() => void couldNotConfirm()}>Não consegui confirmar o brinco</button>
              <button className="button button--ghost button--full" onClick={cancelCurrentRead}>Ler outra tag</button>
            </div>
          ) : (
            <GuidedDecision scan={scan} decision={decision} onConfirm={() => void confirmPhysicalFact()} onCorrect={correctObservedNumber} onUnconfirmed={() => void couldNotConfirm()} onCancel={cancelCurrentRead} />
          )}
        </div>
        )
      )}

      {outcome?.kind === 'correct' && (
        <div className="field-outcome field-outcome--success">
          <CheckIcon size={58} />
          <span className="eyebrow">REGISTRADO</span>
          <h1>{outcome.title}</h1>
          <strong className="outcome-animal">{outcome.animal}</strong>
          <p>Tag {outcome.tagNumber}</p>
          <button className="button button--primary button--full button--field" onClick={() => resetForNext()}>Próxima tag agora</button>
        </div>
      )}

      {outcome?.kind === 'issue' && (
        <div className="field-outcome field-outcome--issue">
          <IssuesIcon size={52} />
          <span className="eyebrow">OCORRÊNCIA SALVA</span>
          <h1>{outcome.title}</h1>
          <p>{outcome.message}</p>
          <div className="outcome-summary">
            <div><span>Tag</span><strong>{outcome.tagNumber}</strong></div>
            <div><span>Nedap</span><strong>{outcome.expectedAnimal ?? '—'}</strong></div>
            <div><span>Brinco visto</span><strong>{outcome.observedAnimal ?? '—'}</strong></div>
          </div>
          <button className="button button--primary button--full button--field" onClick={() => resetForNext()}>Próxima tag</button>
        </div>
      )}

      {outcome?.kind === 'swap' && (
        <div className="field-outcome field-outcome--swap">
          <SwapIcon size={58} />
          <span className="eyebrow">CRUZAMENTO AUTOMÁTICO</span>
          <h1>{outcome.title}</h1>
          <p>As duas leituras confirmadas em campo formam uma possível troca. Você não precisa resolver isso agora.</p>
          <div className="swap-pair">
            <div><span>Tag {outcome.other.tagNumber}</span><strong>{outcome.other.expectedAnimal} → {outcome.other.observedAnimal}</strong></div>
            <SwapIcon size={26} />
            <div><span>Tag {outcome.current.tagNumber}</span><strong>{outcome.current.expectedAnimal} → {outcome.current.observedAnimal}</strong></div>
          </div>
          <button className="button button--primary button--full button--field" onClick={() => resetForNext()}>Entendi, próxima tag</button>
        </div>
      )}

      {!scan && !outcome && (
        <details className="manual-test">
          <summary>Teste manual sem NFC</summary>
          <p>Use o padrao definido. Voce pode digitar so o final da tag.</p>
          <div className="manual-test__row">
            {manualPrefix && <span className="manual-prefix">{manualPrefix}</span>}
            <input className="text-input" inputMode="numeric" placeholder={manualRestLength ? `${manualRestLength} digitos finais` : '9840000...'} value={manualTag} onChange={(event) => setManualTag(event.target.value.replace(/[^0-9]/g, ''))} />
            <button className="button button--secondary" onClick={() => void manualRead()}>Simular</button>
          </div>
          {manualPreviewTag && <small className="manual-preview">Tag simulada: {manualPreviewTag}</small>}
        </details>
      )}
    </section>
  );
}

function GuidedDecision({
  scan,
  decision,
  onConfirm,
  onCorrect,
  onUnconfirmed,
  onCancel
}: {
  scan: ScanState;
  decision: DecisionState;
  onConfirm: () => void;
  onCorrect: () => void;
  onUnconfirmed: () => void;
  onCancel: () => void;
}) {
  const expected = scan.assignment?.expectedAnimal ?? null;
  const observed = decision.observedAnimal ?? '—';
  const previousTag = decision.animalTagContext?.effective?.tagNumber ?? decision.animalTagContext?.assignment?.tagNumber ?? null;
  const isReplacement = Boolean(previousTag && previousTag !== scan.tagNumber && ['reassignment', 'linked', 'new_tag'].includes(decision.status));
  const content = decisionCopy(decision.status, expected, observed, isReplacement);

  return (
    <div className="guided-decision">
      <span className="eyebrow">CONFIRME SOMENTE O QUE ESTÁ VENDO</span>
      <h2>{content.title}</h2>
      <p>{content.subtitle}</p>
      {isReplacement && (
        <div className="replacement-summary">
          <div><span>Tag atual do animal</span><strong>{previousTag}</strong></div>
          <div><span>Tag encontrada</span><strong>{scan.tagNumber}</strong></div>
        </div>
      )}
      <div className="decision-number">{observed}</div>
      <button className="button button--primary button--full button--field" onClick={onConfirm}>{content.confirmLabel}</button>
      <button className="button button--secondary button--full" onClick={onCorrect}>Digitei o brinco errado</button>
      <button className="button button--ghost button--full" onClick={onUnconfirmed}>Não consegui confirmar</button>
      <button className="button button--ghost button--full" onClick={onCancel}>Ler outra tag</button>
      <small className="decision-hint">O BIPTAG decide a classificação e cruza possíveis trocas depois. Você só confirma o fato físico.</small>
    </div>
  );
}

function decisionCopy(status: Exclude<RecordStatus, 'correct'>, expected: string | null, observed: string, isReplacement = false) {
  if (isReplacement) {
    return {
      title: `Registrar substituicao no animal ${observed}?`,
      subtitle: `O animal ${observed} ja possui outra tag cadastrada ou efetiva.`,
      confirmLabel: 'Sim, registrar substituicao'
    };
  }
  if (status === 'divergence' || status === 'reassignment') {
    return {
      title: `O brinco deste animal é ${observed}?`,
      subtitle: `Esta tag está cadastrada no animal ${expected}.`,
      confirmLabel: `Sim, estou no animal ${observed}`
    };
  }
  if (status === 'animal_not_in_base') {
    return {
      title: `Você confirma o brinco ${observed}?`,
      subtitle: `O animal ${observed} não aparece na base Nedap importada.`,
      confirmLabel: `Sim, o brinco é ${observed}`
    };
  }
  if (status === 'tag_without_animal') {
    return {
      title: `Esta tag está no animal ${observed}?`,
      subtitle: 'A tag não possui animal vinculado na base.',
      confirmLabel: `Sim, está no animal ${observed}`
    };
  }
  if (status === 'linked') {
    return {
      title: `Vincular esta tag ao animal ${observed}?`,
      subtitle: 'A tag existe na base, mas esta sem animal vinculado no Nedap.',
      confirmLabel: `Sim, vincular ao animal ${observed}`
    };
  }
  if (status === 'new_tag') {
    return {
      title: `Usar esta nova tag no animal ${observed}?`,
      subtitle: 'A SmartTag nao existe na base, mas o animal existe no Nedap.',
      confirmLabel: 'Sim, registrar nova tag'
    };
  }
  if (status === 'tag_not_found' || status === 'tag_not_registered') {
    return {
      title: `Esta tag está no animal ${observed}?`,
      subtitle: 'A SmartTag não existe na base Nedap importada.',
      confirmLabel: `Sim, está no animal ${observed}`
    };
  }
  return {
    title: 'Não foi possível confirmar?',
    subtitle: 'Salve para revisar depois sem precisar decidir agora.',
    confirmLabel: 'Salvar para revisão'
  };
}

function issueSavedTitle(status: RecordStatus) {
  if (status === 'tag_not_registered') return 'Tag nao cadastrada confirmada';
  if (status === 'divergence' || status === 'reassignment') return 'Tag encontrada em outro animal';
  if (status === 'audit_conflict') return 'Conflito de auditoria';
  if (status === 'linked') return 'Tag vinculada em campo';
  if (status === 'new_tag') return 'Nova tag registrada';
  if (status === 'animal_not_in_base') return 'Animal fora da base';
  if (status === 'tag_without_animal') return 'Tag sem vínculo confirmada';
  if (status === 'tag_not_found') return 'Tag não cadastrada confirmada';
  return 'Ocorrência registrada';
}

function issueSavedMessage(status: RecordStatus, observed: string | null) {
  if (status === 'tag_not_registered') return `A tag foi encontrada fisicamente no animal ${observed ?? ''}, mas nao existe na base importada.`;
  if (status === 'divergence' || status === 'reassignment') return 'O BIPTAG guardou a posicao fisica desta tag e vai cruzar as proximas leituras.';
  if (status === 'audit_conflict') return 'Esta leitura conflita com uma troca ja confirmada. Revise antes de corrigir o cadastro.';
  if (status === 'linked') return `A tag sem vinculo no Nedap foi confirmada fisicamente no animal ${observed ?? ''}.`;
  if (status === 'new_tag') return `A nova SmartTag foi confirmada fisicamente no animal ${observed ?? ''}.`;
  if (status === 'animal_not_in_base') return `O brinco ${observed ?? ''} foi confirmado em campo e ficará separado para revisão.`;
  if (status === 'tag_without_animal') return `O vínculo físico com o animal ${observed ?? ''} foi registrado como sugestão de revisão.`;
  if (status === 'tag_not_found') return `A tag foi encontrada fisicamente no animal ${observed ?? ''}, mas não existe na base importada.`;
  return 'A ocorrência foi salva para revisão posterior.';
}

function IssuesView({ audit, onNeedImport }: { audit: Audit | null; onNeedImport: () => void }) {
  const issues = useLiveQuery(() => audit ? db.importIssues.where('auditId').equals(audit.id).toArray() : Promise.resolve<ImportIssue[]>([]), [audit?.id], [] as ImportIssue[]);
  const records = useLiveQuery(() => audit ? db.auditRecords.where('auditId').equals(audit.id).toArray() : Promise.resolve<AuditRecord[]>([]), [audit?.id], [] as AuditRecord[]);
  const effectiveAssignments = useLiveQuery(() => audit ? db.effectiveTagAssignments.where('auditId').equals(audit.id).toArray() : Promise.resolve<EffectiveTagAssignment[]>([]), [audit?.id], [] as EffectiveTagAssignment[]);

  if (!audit) {
    return <section className="page page--centered"><EmptyState icon={<IssuesIcon size={42} />} title="Sem auditoria" text="Importe uma base para visualizar inconsistências e resultados." action={<button className="button button--primary" onClick={onNeedImport}>Importar planilha</button>} /></section>;
  }

  const activeAudit = audit;
  const current = records.filter((record) => record.isCurrent !== false);
  const nonCorrect = current.filter((record) => record.status !== 'correct');
  const swapRecords = records.filter((record) => record.status === 'possible_swap');
  const conflictRecords = records.filter((record) => record.status === 'audit_conflict');
  const seenPairs = new Set<string>();
  const swapPairs = swapRecords.filter((record) => {
    if (!record.pairId || seenPairs.has(record.pairId)) return false;
    seenPairs.add(record.pairId);
    return true;
  });
  const seenConflictPairs = new Set<string>();
  const conflictPairs = conflictRecords.filter((record) => {
    const key = record.pairId ?? record.id;
    if (seenConflictPairs.has(key)) return false;
    seenConflictPairs.add(key);
    return true;
  });
  const pendingSwaps = nonCorrect.filter((record) => ['reassignment', 'divergence'].includes(record.status));
  const otherIssues = nonCorrect.filter((record) => !['possible_swap', 'audit_conflict', 'reassignment', 'divergence'].includes(record.status));
  const pendingTags = effectiveAssignments.filter((item) => item.status === 'pending');
  const displacedTags = effectiveAssignments.filter((item) => item.status === 'displaced');
  const notFoundTags = effectiveAssignments.filter((item) => item.status === 'not_found');

  async function exportReport() {
    exportAuditWorkbook(activeAudit, records, issues, effectiveAssignments);
  }

  async function markMissingTags() {
    const count = await markPendingTagsNotFound(activeAudit.id);
    if (count) window.alert(`${count} SmartTags foram marcadas como nao localizadas.`);
  }

  return (
    <section className="page">
      <div className="section-heading section-heading--with-action">
        <div><span className="eyebrow">REVISÃO</span><h1>Pendências</h1><p>O campo registra fatos. Aqui o BIPTAG organiza o que precisa ser corrigido depois.</p></div>
        <button className="icon-action" onClick={exportReport} title="Exportar Excel"><ReportIcon /></button>
      </div>

      <div className="stats-grid stats-grid--two">
        <StatCard label="Trocas confirmadas" value={swapPairs.length} tone={swapPairs.length ? 'warning' : 'default'} />
        <StatCard label="Trocas pendentes" value={pendingSwaps.length} tone={pendingSwaps.length ? 'warning' : 'default'} />
        <StatCard label="Conflitos" value={conflictPairs.length} tone={conflictPairs.length ? 'danger' : 'default'} />
        <StatCard label="Outras ocorrências" value={otherIssues.length + displacedTags.length + notFoundTags.length} tone={otherIssues.length || displacedTags.length || notFoundTags.length ? 'danger' : 'default'} />
      </div>

      {pendingTags.length > 0 && (
        <div className="review-action-card">
          <div>
            <span className="eyebrow">TAGS NAO LOCALIZADAS</span>
            <h2>{pendingTags.length} SmartTags ainda sem resultado</h2>
            <p>Antes de finalizar, revise o lote ou marque as SmartTags restantes como nao localizadas.</p>
          </div>
          <button className="button button--secondary button--full" onClick={() => void markMissingTags()}>Marcar pendentes como nao localizadas</button>
        </div>
      )}

      {swapPairs.length > 0 && (
        <>
          <div className="section-heading section-heading--compact"><div><span className="eyebrow">CRUZADAS</span><h2>Possíveis trocas</h2></div></div>
          <div className="issue-list">
            {swapPairs.map((record) => {
              const other = swapRecords.find((candidate) => candidate.id === record.relatedRecordId);
              return <SwapRow key={record.id} record={record} other={other ?? null} />;
            })}
          </div>
        </>
      )}

      {conflictPairs.length > 0 && (
        <>
          <div className="section-heading section-heading--compact"><div><span className="eyebrow">CONFLITOS</span><h2>Conflitos de auditoria</h2></div></div>
          <div className="issue-list">
            {conflictPairs.map((record) => <RecordRow key={record.id} record={record} />)}
          </div>
        </>
      )}

      <div className="section-heading section-heading--compact"><div><h2>Ocorrências de campo</h2></div></div>
      <div className="issue-list">
        {otherIssues.length ? otherIssues.map((record) => <RecordRow key={record.id} record={record} />) : <p className="muted-block">Nenhuma outra ocorrência registrada.</p>}
      </div>

      <div className="section-heading section-heading--compact"><div><h2>Pré-validação da planilha</h2></div></div>
      <div className="issue-list">
        {issues.length ? issues.map((issue) => <IssueRow key={issue.id} issue={issue} />) : <p className="muted-block">Nenhum problema encontrado na importação.</p>}
      </div>

      <button className="button button--secondary button--full" onClick={exportReport}><ReportIcon /> Exportar relatório Excel</button>
    </section>
  );
}

function SwapRow({ record, other }: { record: AuditRecord; other: AuditRecord | null }) {
  return (
    <div className="issue-row issue-row--swap">
      <span className="issue-row__icon"><SwapIcon /></span>
      <div>
        <strong>Possível troca entre animais</strong>
        <span>{record.expectedAnimal} ↔ {record.observedAnimal}</span>
        <small>Tag {record.tagNumber}{other ? ` · Tag ${other.tagNumber}` : ''}</small>
      </div>
    </div>
  );
}

function RecordRow({ record }: { record: AuditRecord }) {
  return (
    <div className="issue-row issue-row--field">
      <span className="issue-row__icon"><IssuesIcon /></span>
      <div>
        <strong>{statusLabel(record.status)}</strong>
        <span>Tag {record.tagNumber}</span>
        <small>Nedap: {record.expectedAnimal ?? '—'} · Brinco visto: {record.observedAnimal ?? '—'}</small>
      </div>
    </div>
  );
}

function IssueRow({ issue }: { issue: ImportIssue }) {
  return (
    <div className="issue-row">
      <span className="issue-row__icon"><IssuesIcon /></span>
      <div>
        <strong>{issue.type === 'tag_without_animal' ? 'Tag sem vínculo' : issue.type === 'duplicate_tag' ? 'Tag duplicada' : 'Animal com múltiplas tags'}</strong>
        <span>{issue.detail}</span>
      </div>
    </div>
  );
}

function SettingsView() {
  return (
    <section className="page">
      <div className="section-heading"><div><span className="eyebrow">CONFIGURAÇÃO</span><h1>BIPTAG Web V0.3</h1><p>Offline-first, mobile-first e preparado para Supabase, GitHub e Vercel.</p></div></div>
      <div className="settings-card">
        <div className="settings-row"><span className="settings-row__icon"><CloudIcon /></span><div><strong>Supabase</strong><small>{isSupabaseConfigured ? 'Variáveis configuradas' : 'Preparado para backup e sincronização na próxima etapa'}</small></div><span className={`status-dot ${isSupabaseConfigured ? 'is-ok' : ''}`} /></div>
        <div className="settings-row"><span className="settings-row__icon"><ScanIcon /></span><div><strong>Web NFC</strong><small>{isWebNfcSupported() ? 'Disponível neste navegador' : 'Use Chrome Android em HTTPS para leitura real'}</small></div><span className={`status-dot ${isWebNfcSupported() ? 'is-ok' : ''}`} /></div>
      </div>
      <div className="technical-note"><strong>Persistência entre dias</strong><p>Auditorias, base importada e leituras ficam no IndexedDB do navegador. Fechar o BIPTAG ou reiniciar o celular não apaga a auditoria. Evite limpar os dados do site até sincronizarmos com o Supabase.</p></div>
    </section>
  );
}

function CloudSettingsView({ activeAudit, setToast }: { activeAudit: Audit | null; setToast: (value: string) => void }) {
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (mounted) setSession(data.session);
    }).catch((err) => setMessage(err instanceof Error ? err.message : 'Nao foi possivel carregar a sessao.'));

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  async function sendMagicLink() {
    if (!supabase || !email.trim()) return;
    setBusy(true);
    setMessage(null);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: window.location.origin }
      });
      if (error) throw error;
      setMessage('Link de acesso enviado. Abra o e-mail neste navegador para ativar a sessao.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Nao foi possivel enviar o link de acesso.');
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    if (!supabase) return;
    setBusy(true);
    setMessage(null);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      setMessage('Sessao encerrada.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Nao foi possivel sair.');
    } finally {
      setBusy(false);
    }
  }

  async function syncNow() {
    if (!activeAudit) {
      setMessage('Nenhuma auditoria local selecionada para sincronizar.');
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const result = await syncAuditToSupabase(activeAudit.id);
      const summary = `Sincronizado: ${result.assignments} tags originais, ${result.effectiveAssignments} estados efetivos, ${result.records} leituras e ${result.issues} pendencias.`;
      setMessage(summary);
      setToast(summary);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Nao foi possivel sincronizar.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="page">
      <div className="section-heading"><div><span className="eyebrow">CONFIGURACAO</span><h1>BIPTAG Web V0.3</h1><p>Offline-first, mobile-first e conectado ao Supabase para backup manual.</p></div></div>
      <div className="settings-card">
        <div className="settings-row"><span className="settings-row__icon"><CloudIcon /></span><div><strong>Supabase</strong><small>{isSupabaseConfigured ? 'Variaveis configuradas' : 'Configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY'}</small></div><span className={`status-dot ${isSupabaseConfigured ? 'is-ok' : ''}`} /></div>
        <div className="settings-row"><span className="settings-row__icon"><CheckIcon /></span><div><strong>Conta</strong><small>{session?.user.email ?? (session ? 'Sessao ativa' : 'Entre para liberar backup na nuvem')}</small></div><span className={`status-dot ${session ? 'is-ok' : ''}`} /></div>
        <div className="settings-row"><span className="settings-row__icon"><ScanIcon /></span><div><strong>Web NFC</strong><small>{isWebNfcSupported() ? 'Disponivel neste navegador' : 'Use Chrome Android em HTTPS para leitura real'}</small></div><span className={`status-dot ${isWebNfcSupported() ? 'is-ok' : ''}`} /></div>
      </div>

      {isSupabaseConfigured && (
        <div className="form-card sync-card">
          {!session ? (
            <>
              <label className="field-label" htmlFor="sync-email">E-mail</label>
              <input id="sync-email" className="text-input" type="email" inputMode="email" placeholder="voce@fazenda.com" value={email} onChange={(event) => setEmail(event.target.value)} />
              <button className="button button--primary button--full" disabled={busy || !email.trim()} onClick={() => void sendMagicLink()}><CloudIcon /> Enviar link de acesso</button>
            </>
          ) : (
            <>
              <button className="button button--primary button--full" disabled={busy || !activeAudit} onClick={() => void syncNow()}><CloudIcon /> Sincronizar auditoria atual</button>
              <button className="button button--ghost button--full" disabled={busy} onClick={() => void signOut()}>Sair da conta</button>
            </>
          )}
          {message && <div className="inline-status">{message}</div>}
        </div>
      )}

      <div className="technical-note"><strong>Persistencia entre dias</strong><p>Auditorias, base importada e leituras continuam no IndexedDB do navegador. A sincronizacao envia uma copia para o Supabase quando houver sessao ativa.</p></div>
    </section>
  );
}

export default App;
