import { useMemo, useState } from 'react';
import { SearchIcon } from '../icons/Icons';

export type TagListRow = { id: string; tagNumber: string; animal: string | null; validationStatus?: string };

export function TagReadOnlyList({ rows, label, source }: { rows: TagListRow[]; label: string; source?: string }) {
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const search = query.trim().toLocaleLowerCase('pt-BR');
    return rows.filter((row) => !search || row.tagNumber.includes(search) || row.animal?.toLocaleLowerCase('pt-BR').includes(search)).sort((a, b) => a.tagNumber.localeCompare(b.tagNumber));
  }, [rows, query]);
  return <div className="tag-read-only-list">
    <div className="tag-read-only-list__meta"><span>{source || 'Somente visualização'}</span><span>{query ? `${filtered.length} de ${rows.length}` : rows.length} tags</span></div>
    <label className="tag-read-only-list__search"><SearchIcon size={18} /><input type="search" aria-label={`Buscar em ${label}`} placeholder="Buscar tag ou animal" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
    <div className="tag-read-only-list__scroll" role="region" aria-label={`Lista de ${label.toLocaleLowerCase('pt-BR')}`} tabIndex={0}>
      <table><thead><tr><th scope="col">SmartTag</th><th scope="col">Animal Nedap</th></tr></thead>
        <tbody>{filtered.map((row) => <tr key={row.id}><td><span className="tag-read-only-list__number">{row.tagNumber}</span>{row.validationStatus && row.validationStatus !== 'valid_tag' && <small>Fora do padrão</small>}</td><td>{row.animal || <span className="tag-read-only-list__unlinked">Sem vínculo</span>}</td></tr>)}</tbody>
      </table>
      {!filtered.length && <p className="tag-read-only-list__empty">{rows.length ? 'Nenhuma tag encontrada.' : 'Nenhuma tag nesta lista.'}</p>}
    </div>
  </div>;
}
