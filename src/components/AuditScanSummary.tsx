import { IssuesIcon } from '../icons/Icons';

export function AuditScanSummary({ tagNumber, inBase, expectedAnimal }: {
  tagNumber: string;
  inBase: boolean;
  expectedAnimal: string | null;
}) {
  return (
    <div className="conference-summary">
      <dl className="conference-summary__data" aria-label="Dados da tag lida">
        <div><dt>Tag lida</dt><dd className="conference-summary__tag">{tagNumber}</dd></div>
        <div><dt>Cadastro Nedap</dt><dd className={expectedAnimal ? 'conference-summary__animal' : 'conference-summary__unlinked'}>{expectedAnimal ?? (inBase ? 'Sem vínculo' : 'Não cadastrada')}</dd></div>
      </dl>
      {(!inBase || !expectedAnimal) && <div className="conference-summary__notice">
        <IssuesIcon size={17} />
        <p>{inBase ? 'A tag está na planilha, mas não tem animal vinculado.' : 'Esta tag não aparece na planilha importada.'} Confira o brinco físico.</p>
      </div>}
    </div>
  );
}
