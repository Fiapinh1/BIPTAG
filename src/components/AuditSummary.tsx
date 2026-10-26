import { CheckIcon, ChevronRightIcon, IssuesIcon, PauseIcon } from '../icons/Icons';
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
    <button className="audit-summary__back" onClick={onBack} aria-label="Voltar para fazendas">‹ Fazendas</button>
    <div className="audit-summary__heading"><span className="eyebrow">RESUMO DA FAZENDA</span><h1>{audit.farmName}</h1><span className={`audit-summary__status ${finished ? 'is-finished' : paused ? 'is-paused' : ''}`}>{finished ? 'Finalizada' : paused ? 'Pausada' : 'Em andamento'}</span></div>
    <section className="audit-summary__progress" aria-label="Andamento da auditoria">
      <div><strong>{metrics.auditedUnique} <span>de {audit.validTags ?? audit.totalTags} tags com resultado</span></strong><span>{metrics.percent}%</span></div>
      <div className="audit-summary__track" role="progressbar" aria-label="Progresso da conferência" aria-valuenow={metrics.percent} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${metrics.percent}%` }} /></div>
      <div className="audit-summary__metrics"><div><strong>{metrics.correct}</strong><span>Corretas</span></div><div><strong>{metrics.problems}</strong><span>Ocorrências</span></div><div><strong>{metrics.pending}</strong><span>Restantes</span></div></div>
      <button className="button button--primary button--full" onClick={finished ? onReview : onContinue}>{finished ? 'Ver revisão' : metrics.auditedUnique ? 'Continuar conferência' : 'Iniciar conferência'}<ChevronRightIcon size={18} /></button>
      {!finished && <div className="audit-summary__actions">{!paused && <button onClick={onPause}><PauseIcon size={16} />Pausar</button>}<button onClick={onFinish}><CheckIcon size={16} />Finalizar auditoria</button></div>}
    </section>
    <button className="audit-summary__alerts" onClick={onKnownIssues}><IssuesIcon size={19} /><span>Problemas conhecidos</span><strong>{knownIssueCount}</strong><ChevronRightIcon size={17} /></button>
    <section className="audit-summary__base" aria-labelledby="imported-tags-title"><div className="audit-summary__list-heading"><h2 id="imported-tags-title">Tags da planilha</h2><span>Somente visualização</span></div><TagReadOnlyList label="Tags da planilha" source={audit.sourceFileName} rows={assignments.map((row) => ({ id: row.id, tagNumber: row.tagNumber, animal: row.expectedAnimal, validationStatus: row.validationStatus }))} /></section>
  </section>;
}
