import type { DragEvent } from 'react';
import { CheckIcon, FarmIcon, HelpCircleIcon, PlayIcon, SpreadsheetIcon } from '../icons/Icons';

type NewAuditFormProps = {
  embedded: boolean;
  farmName: string;
  fileName?: string;
  tagCount?: number;
  busy: boolean;
  dragging: boolean;
  error: string | null;
  onFarmChange: (value: string) => void;
  onFileChange: (file: File | null) => void;
  onFileDrag: (event: DragEvent<HTMLLabelElement>) => void;
  onFileDrop: (event: DragEvent<HTMLLabelElement>) => void;
  onPrepare: () => void;
};

export function NewAuditForm(props: NewAuditFormProps) {
  const ready = Boolean(props.farmName.trim() && props.fileName && props.tagCount !== undefined && !props.busy);
  return <>
    <div className="new-audit__hero">
      <div className="new-audit__art" aria-hidden="true">
        <span className="new-audit__art-farm"><FarmIcon size={53} /></span>
        <span className="new-audit__art-file"><SpreadsheetIcon size={64} /></span>
      </div>
      <span className="eyebrow">NOVA AUDITORIA</span>
      <h1 id={props.embedded ? 'create-farm-title' : undefined}>Criar auditoria</h1>
      <p>Informe a fazenda e selecione a planilha de tags.</p>
    </div>

    <form className="new-audit__form" onSubmit={(event) => { event.preventDefault(); if (ready) props.onPrepare(); }}>
      <div className="new-audit__farm">
        <span className="new-audit__farm-icon"><FarmIcon size={25} /></span>
        <div>
          <label className="field-label" htmlFor="farm">Nome da fazenda</label>
          <input id="farm" className="text-input" placeholder="Ex.: Fazenda Santa Juliana" value={props.farmName} disabled={props.busy} onChange={(event) => props.onFarmChange(event.target.value)} autoComplete="organization" required />
        </div>
      </div>

      <label
        className={`file-drop new-audit__upload ${props.dragging ? 'is-dragging' : ''} ${props.tagCount !== undefined ? 'has-file' : ''}`}
        onDragEnter={props.onFileDrag}
        onDragOver={props.onFileDrag}
        onDragLeave={props.onFileDrag}
        onDrop={props.onFileDrop}
      >
        <input key={props.fileName ?? 'empty-file'} type="file" aria-label="Selecionar planilha de tags" aria-describedby="new-audit-file-help" accept=".xlsx,.xls" disabled={props.busy} onChange={(event) => props.onFileChange(event.target.files?.[0] ?? null)} />
        <span className="new-audit__upload-icon"><SpreadsheetIcon size={37} /></span>
        <strong>{props.fileName || 'Selecionar planilha de tags'}</strong>
        <small id="new-audit-file-help">{props.busy ? 'Analisando a planilha…' : props.fileName ? 'Toque para escolher outro arquivo.' : 'Arraste o arquivo aqui ou toque para escolher.'}</small>
        {props.tagCount !== undefined && !props.busy && <span className="new-audit__file-ready"><CheckIcon size={15} />{props.tagCount} {props.tagCount === 1 ? 'tag reconhecida' : 'tags reconhecidas'}</span>}
      </label>

      <div className="new-audit__file-tip"><HelpCircleIcon size={21} /><div><strong>Sobre a planilha</strong><p>Use um arquivo .xlsx ou .xls com as tags da fazenda.</p></div></div>
      {props.busy && <div className="new-audit__feedback" role="status">Analisando arquivo…</div>}
      {props.error && <div className="alert alert--danger" role="alert">{props.error}</div>}
      <button className="button button--primary button--full new-audit__submit" type="submit" disabled={!ready}><PlayIcon size={21} /><span>Preparar auditoria</span></button>
    </form>
  </>;
}
