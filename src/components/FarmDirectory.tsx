import { useEffect, useRef, useState } from 'react';
import { ChevronRightIcon, SpreadsheetIcon, TagIcon } from '../icons/Icons';
import type { Audit } from '../types/domain';
import { AppInstallPanel } from './AppInstallPanel';
import { AuditDirectory } from './AuditDirectory';
import { scrollPageToTop } from '../services/page-scroll';

export function FarmDirectory({ audits, onOpen, onResume, onCreate, onDelete, onRegister }: {
  audits: Audit[];
  onOpen: (audit: Audit) => void;
  onResume: (audit: Audit) => void;
  onCreate: () => void;
  onDelete: (audit: Audit) => void;
  onRegister: (farmId?: string) => void;
}) {
  const [showAudits, setShowAudits] = useState(false);
  const auditButton = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  useEffect(() => {
    scrollPageToTop();
    if (!showAudits && wasOpen.current) auditButton.current?.focus({ preventScroll: true });
    wasOpen.current = showAudits;
  }, [showAudits]);

  if (showAudits) return <AuditDirectory audits={audits} onBack={() => setShowAudits(false)} onOpen={onOpen} onResume={onResume} onCreate={onCreate} onDelete={onDelete} />;

  return <section className="page farm-directory">
    <div className="farm-directory__heading">
      <div><span className="eyebrow">SUAS SMARTTAGS NO CAMPO</span><h1>Fazendas</h1><p>Cadastre novas tags ou confira os vínculos.</p></div>
      <div className="farm-directory__actions"><AppInstallPanel compact /></div>
    </div>
    <div className="farm-start-actions" aria-label="Começar um trabalho">
      <button className="farm-start-action farm-start-action--registration" aria-labelledby="start-registration-title" aria-describedby="start-registration-description" onClick={() => onRegister()}><span className="farm-start-action__icon"><TagIcon size={25} /></span><span><strong id="start-registration-title">Cadastrar novas tags</strong><small id="start-registration-description">Cadastros salvos e novos vínculos. Sem planilha.</small></span><ChevronRightIcon size={20} /></button>
      <button ref={auditButton} className="farm-start-action" aria-labelledby="start-audit-title" aria-describedby="start-audit-description" onClick={() => setShowAudits(true)}><span className="farm-start-action__icon"><SpreadsheetIcon size={25} /></span><span><strong id="start-audit-title">Auditorias</strong><small id="start-audit-description">Auditorias salvas e conferência com planilha.</small></span><ChevronRightIcon size={20} /></button>
    </div>
  </section>;
}
