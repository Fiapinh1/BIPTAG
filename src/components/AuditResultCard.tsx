import type { ReactNode } from 'react';
import { CheckIcon, IssuesIcon } from '../icons/Icons';

export function AuditResultCard({ tone, title, message, tagNumber, expectedAnimal, observedAnimal, label, children }: {
  tone: 'success' | 'warning' | 'danger';
  title: string;
  message: string;
  tagNumber: string | null;
  expectedAnimal?: string | null;
  observedAnimal?: string | null;
  label?: string;
  children: ReactNode;
}) {
  return <section className={`audit-result audit-result--${tone}`}>
    <div className="audit-result__heading" role="status"><span className="audit-result__icon">{tone === 'success' ? <CheckIcon size={26} /> : <IssuesIcon size={25} />}</span><div><span>{label || (tone === 'success' ? 'CONFERÊNCIA SALVA' : tone === 'danger' ? 'REVISÃO NECESSÁRIA' : 'ATENÇÃO')}</span><h1>{title}</h1></div></div>
    <p className="audit-result__message">{message}</p>
    <dl className="audit-result__data">
      {tagNumber && <div><dt>SmartTag</dt><dd className="audit-result__tag">{tagNumber}</dd></div>}
      {expectedAnimal !== undefined && <div><dt>Animal Nedap</dt><dd>{expectedAnimal || 'Sem vínculo'}</dd></div>}
      {observedAnimal !== undefined && <div><dt>Brinco visto</dt><dd className="audit-result__animal">{observedAnimal || 'Não informado'}</dd></div>}
    </dl>
    <div className="audit-result__actions">{children}</div>
  </section>;
}
