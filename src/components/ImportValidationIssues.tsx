import type { ImportIssue, ImportIssueType } from '../types/domain';

const LABELS: Record<ImportIssueType, string> = {
  invalid_tag: 'Linhas sem SmartTag ou com número inválido',
  suspicious_tag: 'Tags fora do padrão',
  possible_typo: 'Possíveis erros de digitação',
  duplicate_tag: 'Tags repetidas na planilha',
  multiple_tags_same_animal: 'Animais com mais de uma SmartTag',
  tag_without_animal: 'SmartTags sem animal vinculado'
};

export function ImportValidationIssues({ issues }: { issues: Pick<ImportIssue, 'type' | 'tagNumber' | 'animal' | 'detail'>[] }) {
  const groups = new Map<ImportIssueType, typeof issues>();
  for (const issue of issues) groups.set(issue.type, [...(groups.get(issue.type) ?? []), issue]);
  return <div className="import-validation">
    <p>Abra um grupo para conferir os avisos encontrados na planilha.</p>
    {[...groups].map(([type, rows]) => <details key={type} className="import-validation__group">
      <summary><span>{LABELS[type]}</span><strong>{rows.length}</strong></summary>
      <ul>{rows.map((row, index) => <li key={index}>
        {(row.animal || row.tagNumber) && <strong>{[row.animal ? `Animal ${row.animal}` : '', row.tagNumber ? `Tag ${row.tagNumber}` : ''].filter(Boolean).join(' · ')}</strong>}
        <p>{row.detail}</p>
      </li>)}</ul>
    </details>)}
  </div>;
}
