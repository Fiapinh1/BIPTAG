import { useEffect, useRef, useState } from 'react';
import { ChevronRightIcon, FarmIcon, ImportIcon, MoreIcon, PlusIcon, SearchIcon, TrashIcon } from '../icons/Icons';
import type { Audit } from '../types/domain';
import { AppInstallPanel } from './AppInstallPanel';

const statuses = {
  in_progress: { label: 'Em andamento', filter: 'Em andamento' },
  paused: { label: 'Pausada', filter: 'Pausadas' },
  finished: { label: 'Finalizada', filter: 'Finalizadas' },
  draft: { label: 'Em preparo', filter: 'Em preparo' }
};
type StatusFilter = keyof typeof statuses;

function statusOf(audit: Audit): StatusFilter {
  return audit.status === 'active' ? 'in_progress' : audit.status;
}

function activityOf(audit: Audit) {
  return audit.lastActivityAt || audit.updatedAt || audit.createdAt;
}

function auditDate(audit: Audit) {
  return new Date(activityOf(audit)).toLocaleDateString('pt-BR');
}

function searchable(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
}

export function FarmDirectory({ audits, onOpen, onResume, onCreate, onDelete }: {
  audits: Audit[];
  onOpen: (audit: Audit) => void;
  onResume: (audit: Audit) => void;
  onCreate: () => void;
  onDelete: (audit: Audit) => void;
}) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | StatusFilter>('all');
  const directoryRef = useRef<HTMLElement>(null);
  const sorted = [...audits].sort((a, b) => activityOf(b).localeCompare(activityOf(a)));
  const counts = sorted.reduce((result, audit) => {
    result[statusOf(audit)]++;
    return result;
  }, { in_progress: 0, paused: 0, finished: 0, draft: 0 });
  const availableFilters = (Object.keys(statuses) as StatusFilter[]).filter((status) => counts[status] > 0);
  // If the last row in a filtered status was removed, return to the full list.
  const activeFilter = filter !== 'all' && counts[filter] === 0 ? 'all' : filter;
  const normalizedQuery = searchable(query.trim());
  const visible = sorted.filter((audit) =>
    (activeFilter === 'all' || statusOf(audit) === activeFilter)
    && (!normalizedQuery || searchable(audit.farmName).includes(normalizedQuery))
  );
  const recent = sorted.find((audit) => ['in_progress', 'paused'].includes(statusOf(audit)));

  useEffect(() => {
    function closeMenus(event: Event) {
      directoryRef.current?.querySelectorAll<HTMLDetailsElement>('.farm-row__actions[open]').forEach((menu) => {
        if (event.type === 'keydown') {
          if ((event as KeyboardEvent).key !== 'Escape') return;
          menu.open = false;
          menu.querySelector('summary')?.focus();
        } else if (!menu.contains(event.target as Node)) menu.open = false;
      });
    }
    document.addEventListener('pointerdown', closeMenus);
    document.addEventListener('keydown', closeMenus);
    return () => {
      document.removeEventListener('pointerdown', closeMenus);
      document.removeEventListener('keydown', closeMenus);
    };
  }, []);

  return (
    <section className="page farm-directory" ref={directoryRef}>
      <div className="farm-directory__heading">
        <div><span className="eyebrow">AUDITORIAS DE SMARTTAGS</span><h1>Fazendas</h1><p>Suas auditorias, prontas para continuar.</p></div>
        <div className="farm-directory__actions"><AppInstallPanel compact />{audits.length > 0 && <button className="button button--primary farm-directory__create" onClick={onCreate}><PlusIcon size={19} /> Nova auditoria</button>}</div>
      </div>

      {audits.length > 1 && recent && (
        <div className="farm-resume">
          <div className="farm-resume__copy"><span>CONTINUAR DE ONDE PAROU</span><h2>{recent.farmName}</h2><p>{statuses[statusOf(recent)].label} <span aria-hidden="true">·</span> Última atividade em {auditDate(recent)}</p></div>
          <button className="button farm-resume__button" onClick={() => onResume(recent)}>Continuar <ChevronRightIcon size={18} /></button>
        </div>
      )}

      {audits.length > 0 ? (
        <section className="farm-directory__saved" aria-labelledby="saved-farms-title">
          <div className="farm-directory__list-heading"><h2 id="saved-farms-title">Auditorias salvas <span>{audits.length}</span></h2><span>Mais recentes primeiro</span></div>
          {audits.length > 3 && <div className="farm-directory__search"><SearchIcon size={20} /><input type="search" aria-label="Buscar fazenda" placeholder="Buscar pelo nome da fazenda" value={query} onChange={(event) => setQuery(event.target.value)} /></div>}
          {availableFilters.length > 1 && <div className="farm-directory__filters" role="group" aria-label="Filtrar auditorias por status">
            <button aria-pressed={activeFilter === 'all'} onClick={() => setFilter('all')}>Todas <span>{audits.length}</span></button>
            {availableFilters.map((status) => <button key={status} aria-pressed={activeFilter === status} onClick={() => setFilter(status)}>{statuses[status].filter} <span>{counts[status]}</span></button>)}
          </div>}
          {visible.length > 0 ? <ul className="farm-directory__list">
            {visible.map((audit) => <li key={audit.id} className="farm-row">
              <button className="farm-row__open" onClick={() => onOpen(audit)} aria-label={`Abrir auditoria de ${audit.farmName}`}>
                <span className="farm-row__icon"><FarmIcon size={23} /></span>
                <span className="farm-row__copy"><strong>{audit.farmName}</strong><small>{(audit.validTags ?? audit.totalTags).toLocaleString('pt-BR')} tags <span aria-hidden="true">·</span> {auditDate(audit)}</small></span>
                <span className={`farm-status farm-status--${statusOf(audit)}`}><span aria-hidden="true" />{statuses[statusOf(audit)].label}</span>
                <ChevronRightIcon className="farm-row__chevron" size={18} />
              </button>
              <details className="farm-row__actions">
                <summary aria-label={`Opções da auditoria de ${audit.farmName}`}><MoreIcon size={20} /></summary>
                <div><button onClick={(event) => { event.currentTarget.closest('details')?.removeAttribute('open'); onDelete(audit); }}><TrashIcon size={17} /> Excluir auditoria</button></div>
              </details>
            </li>)}
          </ul> : <div className="farm-directory__no-results"><SearchIcon size={28} /><h3>Nenhuma auditoria encontrada</h3><p>Tente outro nome ou escolha outro status.</p><button className="button button--ghost" onClick={() => { setQuery(''); setFilter('all'); }}>Limpar filtros</button></div>}
        </section>
      ) : (
        <div className="farm-directory__empty">
          <span className="farm-directory__empty-icon"><ImportIcon size={32} /></span>
          <h2>Sua primeira auditoria começa aqui</h2>
          <p>Importe a planilha Tags.xlsx do Nedap. Depois, confira as tags pelo bastão, pelo telefone ou manualmente.</p>
          <button className="button button--primary" onClick={onCreate}><PlusIcon size={19} /> Importar planilha</button>
          <small>As auditorias ficam salvas neste aparelho.</small>
        </div>
      )}
    </section>
  );
}
