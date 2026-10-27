import { ArrowLeftIcon, HomeIcon } from '../icons/Icons';

export function PageNavigation({ onHome, onBack, backHint = 'Resumo da fazenda' }: {
  onHome: () => void;
  onBack?: () => void;
  backHint?: string;
}) {
  return <nav className={`page-navigation ${onBack ? '' : 'page-navigation--single'}`} aria-label="Voltar e início">
    {onBack && <button className="page-navigation__button" onClick={onBack} aria-label={`Voltar para ${backHint}`}>
      <ArrowLeftIcon size={22} aria-hidden="true" /><span><strong>Voltar</strong><small>{backHint}</small></span>
    </button>}
    <button className="page-navigation__button page-navigation__button--home" onClick={onHome}>
      <HomeIcon size={22} aria-hidden="true" /><span><strong>{onBack ? 'Início' : 'Voltar ao início'}</strong><small>Todas as fazendas</small></span>
    </button>
  </nav>;
}
