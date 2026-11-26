import { useEffect, useRef, useState } from 'react';
import type { Audit } from '../types/domain';
import { ArrowLeftIcon, CalendarIcon, CheckIcon, ChevronRightIcon, ClockIcon, FarmIcon, MoreIcon, PlusIcon, ScanIcon, SearchIcon, SpreadsheetIcon, TagIcon, TrashIcon } from '../icons/Icons';
import { scrollPageToTop } from '../services/page-scroll';

type AuditGroup = 'in_progress' | 'finished';
const groups = { in_progress: { label: 'Em andamento', icon: ClockIcon }, finished: { label: 'Concluídas', icon: CheckIcon } };
const groupOf = (audit: Audit): AuditGroup => audit.status === 'finished' ? 'finished' : 'in_progress';
const activityOf = (audit: Audit) => audit.lastActivityAt || audit.updatedAt || audit.createdAt;
const searchable = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');

export function AuditDirectory({ audits, onBack, onOpen, onResume, onCreate, onDelete }: {
  audits: Audit[];
  onBack: () => void;
  onOpen: (audit: Audit) => void;
  onResume: (audit: Audit) => void;
  onCreate: () => void;
  onDelete: (audit: Audit) => void;
}) {
  const [filter, setFilter] = useState<AuditGroup>(() => audits.some(audit => groupOf(audit) === 'in_progress') || !audits.length ? 'in_progress' : 'finished');
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const directory = useRef<HTMLElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const sorted = [...audits].sort((a, b) => activityOf(b).localeCompare(activityOf(a)));
  const counts = sorted.reduce((result, audit) => { result[groupOf(audit)]++; return result; }, { in_progress: 0, finished: 0 });
  const visible = sorted.filter(audit => groupOf(audit) === filter && searchable(audit.farmName).includes(searchable(query.trim())));
  const recent = sorted.find(audit => ['in_progress', 'active', 'paused'].includes(audit.status));

  useEffect(() => { scrollPageToTop(); heading.current?.focus({ preventScroll: true }); }, []);
  useEffect(() => { if (searchOpen) search.current?.focus(); }, [searchOpen]);
  useEffect(() => {
    function closeMenus(event: Event) {
      directory.current?.querySelectorAll<HTMLDetailsElement>('.audit-directory__options[open]').forEach(menu => {
        if (event.type === 'keydown') {
          if ((event as KeyboardEvent).key !== 'Escape') return;
          menu.open = false; menu.querySelector('summary')?.focus();
        } else if (!menu.contains(event.target as Node)) menu.open = false;
      });
    }
    document.addEventListener('pointerdown', closeMenus); document.addEventListener('keydown', closeMenus);
    return () => { document.removeEventListener('pointerdown', closeMenus); document.removeEventListener('keydown', closeMenus); };
  }, []);

  return <section className="audit-directory" ref={directory}>
    <header className="audit-directory__heading"><button className="audit-directory__back" onClick={onBack} aria-label="Voltar ao início"><ArrowLeftIcon size={19} /><span>Início</span></button><h1 ref={heading} tabIndex={-1}>Auditorias</h1></header>

    <div className={`audit-directory__actions ${recent ? '' : 'audit-directory__actions--single'}`}>
      <button className="audit-directory__action audit-directory__action--new" onClick={onCreate} aria-label="Nova auditoria" aria-describedby="new-audit-description"><span className="audit-directory__action-icon"><SpreadsheetIcon size={26} /><PlusIcon size={12} /></span><span><strong>Nova auditoria</strong><small id="new-audit-description">Importar planilha</small></span><ChevronRightIcon size={16} /></button>
      {recent && <button className="audit-directory__action" onClick={() => onResume(recent)} aria-label={`Continuar auditoria de ${recent.farmName}`}><ScanIcon size={27} /><span><strong>Continuar</strong><small title={recent.farmName}>{recent.farmName}</small></span><ChevronRightIcon size={16} /></button>}
    </div>

    <div className="audit-directory__filters" role="group" aria-label="Filtrar auditorias por status">{(Object.keys(groups) as AuditGroup[]).map(key => {
      const Icon = groups[key].icon;
      return <button key={key} aria-label={groups[key].label} aria-describedby={`audit-count-${key}`} aria-pressed={filter === key} onClick={() => setFilter(key)}><Icon size={17} /><span>{groups[key].label}</span><small id={`audit-count-${key}`}>{counts[key]}</small></button>;
    })}</div>

    <section className="audit-directory__saved" aria-labelledby="saved-audits-title">
      <div className="audit-directory__list-heading"><h2 id="saved-audits-title">Auditorias salvas <span aria-label={`${visible.length} auditorias nesta lista`}>{visible.length}</span></h2><button className={`audit-directory__search-toggle ${searchOpen ? 'is-open' : ''}`} aria-label={searchOpen ? 'Fechar busca' : 'Buscar auditorias'} aria-expanded={searchOpen} aria-controls="audit-directory-search" onClick={() => { setSearchOpen(!searchOpen); setQuery(''); }}><SearchIcon size={21} /></button></div>
      {searchOpen && <div id="audit-directory-search" className="audit-directory__search"><SearchIcon size={19} /><input ref={search} type="search" aria-label="Buscar fazenda" placeholder="Buscar pelo nome da fazenda" value={query} onChange={event => setQuery(event.target.value)} /></div>}
      {visible.length ? <ul className="audit-directory__list">{visible.map(audit => {
        const finished = groupOf(audit) === 'finished'; const Icon = finished ? CheckIcon : ClockIcon;
        return <li className="audit-directory__card" key={audit.id}>
          <button className="audit-directory__open" onClick={() => onOpen(audit)} aria-label={`Abrir auditoria de ${audit.farmName}`}>
            <span className="audit-directory__farm-icon"><FarmIcon size={25} /></span>
            <span className="audit-directory__farm-copy"><strong>{audit.farmName}</strong><span className="audit-directory__meta"><span><TagIcon size={12} />{(audit.validTags ?? audit.totalTags).toLocaleString('pt-BR')} tags</span><span><CalendarIcon size={12} />{new Date(activityOf(audit)).toLocaleDateString('pt-BR')}</span></span><span className={`audit-directory__status ${finished ? 'is-finished' : ''}`}><Icon size={12} />{finished ? 'Concluída' : 'Em andamento'}</span></span>
            <ChevronRightIcon className="audit-directory__chevron" size={21} />
          </button>
          <details className="audit-directory__options" onToggle={event => {
            const menu = event.currentTarget;
            if (menu.open) {
              directory.current?.querySelectorAll<HTMLDetailsElement>('.audit-directory__options[open]').forEach(other => { if (other !== menu) other.open = false; });
              menu.querySelector('div')?.scrollIntoView({ block: 'nearest' });
            }
          }}><summary aria-label={`Opções da auditoria de ${audit.farmName}`}><MoreIcon size={20} /></summary><div><button onClick={event => { event.currentTarget.closest('details')?.removeAttribute('open'); onDelete(audit); }}><TrashIcon size={17} />Excluir auditoria</button></div></details>
        </li>;
      })}</ul> : <div className="audit-directory__empty"><span><SpreadsheetIcon size={29} /></span><h3>{query ? 'Nenhuma fazenda encontrada' : filter === 'finished' ? 'Nenhuma auditoria concluída' : 'Nenhuma auditoria em andamento'}</h3><p>{query ? 'Tente outro nome ou limpe a busca.' : filter === 'finished' ? 'As auditorias finalizadas aparecerão aqui.' : 'Importe uma planilha para começar a conferência.'}</p>{query && <button onClick={() => { setQuery(''); search.current?.focus(); }}>Limpar busca</button>}</div>}
    </section>
  </section>;
}
