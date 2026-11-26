import { BookOpenIcon, CheckIcon, ChevronRightIcon, ClipboardIcon, ScanIcon, SearchIcon, SpreadsheetIcon, TagIcon } from '../icons/Icons';

export function QuickStartGuide({ compact = false }: { compact?: boolean }) {
  const guide = <div className="quick-start-guide">
    <div className="quick-start-guide__paths">
      <article><span className="experience-icon"><TagIcon size={24} /></span><div><h3>Vou colocar tags novas nos animais</h3><p>Escolha <strong>Cadastrar novas tags</strong>. Informe a fazenda, leia ou digite a tag e coloque o número do brinco. Toque em <strong>Salvar e adicionar próximo</strong>.</p><small>Você começa sem uma planilha.</small></div></article>
      <article><span className="experience-icon"><SpreadsheetIcon size={24} /></span><div><h3>Vou conferir os vínculos da planilha</h3><p>Abra <strong>Auditorias</strong> e escolha uma auditoria salva ou toque em <strong>Nova auditoria</strong> para importar o arquivo do Nedap. Depois, abra <strong>Auditar</strong> e confira o brinco que está no animal.</p><small>A planilha serve de referência para a conferência.</small></div></article>
    </div>
    <div className="quick-start-guide__legend"><h3>Onde encontro cada coisa?</h3>
      <p><ScanIcon size={21} /><span><strong>Auditar</strong>Ler tags e confirmar o animal no campo.</span></p>
      <p><SearchIcon size={21} /><span><strong>Consultar</strong>Buscar uma tag ou animal, sem registrar uma leitura.</span></p>
      <p><ClipboardIcon size={21} /><span><strong>Revisão</strong>Ver o que precisa de atenção e exportar o resultado.</span></p>
    </div>
    <p className="quick-start-guide__saved"><CheckIcon size={19} /><span>Cada vínculo ou leitura <strong>confirmada</strong> fica salvo neste aparelho. Você pode voltar ao início e continuar depois.</span></p>
  </div>;
  return compact ? <details className="getting-started"><summary><BookOpenIcon size={22} /><span><strong>Primeira vez no BIPTAG?</strong><small>Veja por onde começar e o que cada ícone faz.</small></span><ChevronRightIcon size={18} /></summary>{guide}</details> : guide;
}
