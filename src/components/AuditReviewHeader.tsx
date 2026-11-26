import { ReportIcon, ShareIcon } from '../icons/Icons';
import { ContextHelp } from './ContextHelp';

export function AuditReviewHeader({ onShare, onExport }: { onShare: () => void; onExport: () => void }) {
  return <header className="review-heading">
    <div className="review-hero">
      <img className="review-hero__illustration" src="/images/audit-review-illustration.webp" alt="" width={720} height={480} decoding="async" />
      <div className="review-hero__copy">
        <div className="review-hero__eyebrow"><span className="eyebrow">REVISÃO</span><ContextHelp title="Revisão da auditoria"><p>Confira as pendências e as ações sugeridas para o cadastro da fazenda.</p><p>Use WhatsApp para compartilhar o resumo ou Excel para exportar o relatório completo.</p></ContextHelp></div>
        <h1>Revisão da auditoria</h1>
      </div>
    </div>
    <div className="review-header-actions">
      <button className="button button--ghost" onClick={onShare}><ShareIcon size={20} />WhatsApp</button>
      <button className="button button--primary" onClick={onExport}><ReportIcon size={20} />Exportar Excel</button>
    </div>
  </header>;
}
