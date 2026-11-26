import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { HelpCircleIcon } from '../icons/Icons';

export function ContextHelp({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal();
    if (!open && dialog.current?.open) dialog.current.close();
  }, [open]);
  return <>
    <button type="button" className="context-help-trigger" aria-label={`Ajuda: ${title}`} title={title} aria-haspopup="dialog" onClick={() => setOpen(true)}><HelpCircleIcon size={21} /></button>
    <dialog ref={dialog} className="context-help-dialog" aria-labelledby={titleId} onCancel={() => setOpen(false)} onClose={() => setOpen(false)} onClick={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <div className="context-help-dialog__heading"><span className="context-help-dialog__icon"><HelpCircleIcon size={23} /></span><h2 id={titleId}>{title}</h2><button type="button" className="app-modal__close" onClick={() => setOpen(false)} aria-label="Fechar ajuda">×</button></div>
      <div className="context-help-dialog__content">{children}</div>
      <button type="button" className="button button--ghost button--full" onClick={() => setOpen(false)}>Entendi</button>
    </dialog>
  </>;
}
