import { ArrowLeftIcon, CheckIcon, ChevronRightIcon, ClockIcon, IssuesIcon, PauseIcon, ReportIcon, ScanIcon, TagIcon } from '../icons/Icons';
import type { Audit, TagAssignment } from '../types/domain';
import { TagReadOnlyList } from './TagReadOnlyList';

export function AuditSummary({ audit, metrics, assignments, knownIssueCount, onBack, onContinue, onPause, onFinish, onReview, onKnownIssues }: {
  audit: Audit;
  metrics: { correct: number; problems: number; auditedUnique: number; pending: number; percent: number };
  assignments: TagAssignment[];
  knownIssueCount: number;
  onBack: () => void;
  onContinue: () => void;
  onPause: () => void;
  onFinish: () => void;
  onReview: () => void;
  onKnownIssues: () => void;
}) {
  const finished = audit.status === 'finished';
  const paused = audit.status === 'paused';
  return <section className="page audit-summary">
    <div className="audit-summary__hero">
      <img className="audit-summary__hero-image" src="/images/farm-summary-hero.webp" alt="" width={960} height={640} decoding="async" />
      <button className="audit-summary__back" onClick={onBack}><ArrowLeftIcon size={18} />Voltar ao início</button>
      <div className="audit-summary__heading"><span className="eyebrow">RESUMO DA FAZENDA</span><h1>{audit.farmName}</h1><span className={`audit-summary__status ${finished ? 'is-finished' : paused ? 'is-paused' : ''}`}>{finished ? <CheckIcon size={14} /> : paused ? <PauseIcon size={14} /> : <span className="audit-summary__status-dot" aria-hidden="true" />}{finished ? 'Finalizada' : paused ? 'Pausada' : 'Em andamento'}</span></div>
    </div>
    <section className="audit-summary__progress" aria-label="Andamento da auditoria">
      <div className="audit-summary__result"><TagIcon size={23} /><strong>{metrics.auditedUnique} <span>de {audit.validTags ?? audit.totalTags} tags com resultado</span></strong><span className="audit-summary__percent">{metrics.percent}%</span></div>
      <div className="audit-summary__track" role="progressbar" aria-label="Progresso da conferência" aria-valuenow={metrics.percent} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${metrics.percent}%` }} /></div>
      <div className="audit-summary__metrics"><div><strong><CheckIcon size={21} />{metrics.correct}</strong><span>Corretas</span></div><div><strong><IssuesIcon size={21} />{metrics.problems}</strong><span>Ocorrências</span></div><div><strong><ClockIcon size={21} />{metrics.pending}</strong><span>Restantes</span></div></div>
      <button className="button button--primary button--full audit-summary__continue" onClick={finished ? onReview : onContinue}>{finished ? <ReportIcon size={21} /> : <ScanIcon size={21} />}<span>{finished ? 'Ver revisão' : metrics.auditedUnique ? 'Continuar conferência' : 'Iniciar conferência'}</span><ChevronRightIcon size={18} /></button>
      {!finished && <div className="audit-summary__actions">{!paused && <button onClick={onPause}><PauseIcon size={16} />Pausar</button>}<button onClick={onFinish}><CheckIcon size={16} />Finalizar auditoria</button></div>}
    </section>
    <button className="audit-summary__alerts" onClick={onKnownIssues}><IssuesIcon size={19} /><span>Problemas conhecidos</span><strong>{knownIssueCount}</strong><ChevronRightIcon size={17} /></button>
    <section className="audit-summary__base" aria-labelledby="imported-tags-title"><div className="audit-summary__list-heading"><h2 id="imported-tags-title">Tags da planilha</h2><span>Somente visualização</span></div><TagReadOnlyList label="Tags da planilha" source={audit.sourceFileName} showSourceIcon rows={assignments.map((row) => ({ id: row.id, tagNumber: row.tagNumber, animal: row.expectedAnimal, validationStatus: row.validationStatus }))} /></section>
  </section>;
}
