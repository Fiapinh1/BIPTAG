import { useState, type CSSProperties, type ReactNode } from 'react';
import {
  AnimalIcon,
  ActionIcon,
  CheckIcon,
  ChevronRightIcon,
  CloudIcon,
  HomeIcon,
  ImportIcon,
  IssuesIcon,
  PlayIcon,
  ScanIcon,
  TagIcon
} from '../icons/Icons';
import './design-preview.css';

type PreviewScreen = 'home' | 'audit-home' | 'new-audit' | 'field' | 'lookup' | 'review' | 'settings';
type FieldState = 'waiting' | 'read' | 'correct' | 'divergence';

const audit = {
  farmName: 'Santa Juliana',
  checked: 243,
  total: 355,
  progress: 68,
  review: 17,
  withoutTag: 4
};

const latestConferences = [
  { animal: '4102', tag: '984000008891722', when: 'Agora', status: 'Movimento' },
  { animal: '4105', tag: '984000008891723', when: 'Ha 18 segundos', status: 'Correta' }
];

const previousAudits = [
  { name: 'Corumba9156339', date: '17/08/2026', status: 'Em andamento', progress: 42, checked: 148, total: 351 },
  { name: 'Alta', date: '17/08/2026', status: 'Finalizada', progress: 100, checked: 351, total: 351 }
];

const reviewItems = [
  {
    type: 'MOVER TAG',
    title: 'Tag ...1722',
    detail: '4101 -> 4102',
    note: 'Evidencia fisica confirmada',
    tone: 'movement'
  },
  {
    type: 'POSSIVEL ERRO DE CADASTRO',
    title: 'Nedap: 904000008891626',
    detail: 'Campo: 984000008891626',
    note: 'Animal 4103',
    tone: 'warning'
  },
  {
    type: 'NAO CONFIRMADA',
    title: 'Tag ...55469',
    detail: 'Cadastro 3498',
    note: 'Aguardando revisao',
    tone: 'muted'
  },
  {
    type: 'NAO LOCALIZADA',
    title: 'Animal 3917',
    detail: 'Tag da base ainda nao apareceu',
    note: 'Revisar antes de corrigir',
    tone: 'danger'
  }
];

function shortTag(tag: string) {
  return `...${tag.slice(-4)}`;
}

function DesignPreview() {
  const [screen, setScreen] = useState<PreviewScreen>('home');
  const [fieldState, setFieldState] = useState<FieldState>('waiting');
  const inAudit = ['audit-home', 'field', 'lookup', 'review'].includes(screen);

  return (
    <div className="design-preview">
      <header className="dp-topbar">
        <button type="button" className="dp-brand" onClick={() => setScreen('home')}>
          <span className="dp-brand__mark"><img src="/icons/biptag-logo-192.png" alt="BIPTAG" /></span>
          <span>
            <strong>BIPTAG</strong>
            <small>Field Console</small>
          </span>
        </button>

        <nav className="dp-desktop-nav" aria-label="Preview">
          {inAudit ? (
            <>
              <PreviewNavButton active={screen === 'audit-home'} onClick={() => setScreen('audit-home')}>Resumo</PreviewNavButton>
              <PreviewNavButton active={screen === 'field'} onClick={() => setScreen('field')}>Auditar</PreviewNavButton>
              <PreviewNavButton active={screen === 'lookup'} onClick={() => setScreen('lookup')}>Consultar</PreviewNavButton>
              <PreviewNavButton active={screen === 'review'} onClick={() => setScreen('review')}>Revisao</PreviewNavButton>
            </>
          ) : (
            <>
              <PreviewNavButton active={screen === 'home'} onClick={() => setScreen('home')}>Fazendas</PreviewNavButton>
              <PreviewNavButton active={screen === 'new-audit'} onClick={() => setScreen('new-audit')}>Nova fazenda</PreviewNavButton>
              <PreviewNavButton active={screen === 'settings'} onClick={() => setScreen('settings')}>Configuracao</PreviewNavButton>
            </>
          )}
        </nav>

        <button type="button" className="dp-status-pill" onClick={() => setScreen('settings')}><ActionIcon size={18} /> Configuracao</button>
      </header>

      <main className="dp-main">
        {screen === 'home' && <HomePreview onNavigate={setScreen} />}
        {screen === 'audit-home' && <AuditHomePreview onNavigate={setScreen} />}
        {screen === 'new-audit' && <NewAuditPreview onContinue={() => setScreen('field')} />}
        {screen === 'field' && <FieldPreview state={fieldState} setState={setFieldState} />}
        {screen === 'lookup' && <LookupPreview />}
        {screen === 'review' && <ReviewPreview />}
        {screen === 'settings' && <SettingsPreview />}
      </main>

      {inAudit ? (
        <nav className="dp-mobile-nav dp-mobile-nav--audit" aria-label="Atalhos da auditoria">
          <MobileNavButton active={screen === 'audit-home'} icon={<HomeIcon />} label="Resumo" onClick={() => setScreen('audit-home')} />
          <MobileNavButton active={screen === 'field'} icon={<ScanIcon />} label="Auditar" onClick={() => setScreen('field')} />
          <MobileNavButton active={screen === 'lookup'} icon={<AnimalIcon />} label="Consultar" onClick={() => setScreen('lookup')} />
          <MobileNavButton active={screen === 'review'} icon={<IssuesIcon />} label="Revisao" onClick={() => setScreen('review')} />
        </nav>
      ) : (
        <nav className="dp-mobile-nav" aria-label="Navegacao principal">
          <MobileNavButton active={screen === 'home'} icon={<HomeIcon />} label="Fazendas" onClick={() => setScreen('home')} />
          <MobileNavButton active={screen === 'new-audit'} icon={<ImportIcon />} label="Nova" onClick={() => setScreen('new-audit')} />
          <MobileNavButton active={screen === 'settings'} icon={<ActionIcon />} label="Config." onClick={() => setScreen('settings')} />
        </nav>
      )}
    </div>
  );
}

function PreviewNavButton({ active, children, onClick }: { active: boolean; children: string; onClick: () => void }) {
  return (
    <button type="button" className={`dp-nav-button ${active ? 'is-active' : ''}`} onClick={onClick}>
      {children}
    </button>
  );
}

function MobileNavButton({
  active,
  icon,
  label,
  onClick
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button type="button" className={`dp-mobile-nav__button ${active ? 'is-active' : ''}`} onClick={onClick}>
      {icon}
      <span>{label}</span>
    </button>
  );
}

function HomePreview({ onNavigate }: { onNavigate: (screen: PreviewScreen) => void }) {
  return (
    <section className="dp-page dp-page--farms">
      <div className="dp-context-row">
        <div>
          <span className="dp-eyebrow">INICIO</span>
          <h1>Fazendas</h1>
          <p>Crie uma auditoria, abra uma fazenda em andamento ou consulte um historico salvo.</p>
        </div>
        <button type="button" className="dp-icon-button" onClick={() => onNavigate('new-audit')} aria-label="Criar nova auditoria">
          <ImportIcon />
        </button>
      </div>

      <section className="dp-home-active">
        <div className="dp-home-active__copy">
          <span className="dp-eyebrow">EM ANDAMENTO</span>
          <h2>{audit.farmName}</h2>
          <p>{audit.checked} de {audit.total} conferidas</p>
          <ProgressBar value={audit.progress} compact />
          <div className="dp-home-actions">
            <button type="button" className="dp-primary-action" onClick={() => onNavigate('field')}><PlayIcon /> Continuar</button>
            <button type="button" className="dp-secondary-action" onClick={() => onNavigate('audit-home')}>Abrir resumo</button>
          </div>
        </div>
        <div className="dp-home-active__progress" style={{ '--dp-progress': `${audit.progress * 3.6}deg` } as CSSProperties}>
          <strong>{audit.progress}%</strong>
          <span>concluido</span>
        </div>
      </section>

      <section className="dp-section dp-section--tight">
        <div className="dp-section-title">
          <span className="dp-eyebrow">AUDITORIAS</span>
          <h2>Outras fazendas</h2>
        </div>
        <div className="dp-audit-list">
          {previousAudits.map((item) => (
            <button type="button" className="dp-audit-row" key={item.name} onClick={() => onNavigate('audit-home')}>
              <span>
                <strong>{item.name}</strong>
                <small>{item.checked} de {item.total} - {item.status}</small>
              </span>
              <span>{item.progress}%</span>
            </button>
          ))}
        </div>
      </section>

      <button type="button" className="dp-create-card" onClick={() => onNavigate('new-audit')}>
        <span><ImportIcon /></span>
        <strong>Criar nova fazenda</strong>
        <small>Importar Tags.xlsx e iniciar outra auditoria.</small>
      </button>
    </section>
  );
}

function AuditHomePreview({ onNavigate }: { onNavigate: (screen: PreviewScreen) => void }) {
  return (
    <section className="dp-page dp-page--audit-home">
      <div className="dp-context-row">
        <div>
          <span className="dp-eyebrow">AUDITORIA ABERTA</span>
          <h1>{audit.farmName}</h1>
          <p>Esta tela mostra apenas o necessario para continuar a conferencia sem perder contexto.</p>
        </div>
      </div>

      <section className="dp-farm-panel dp-farm-panel--compact">
        <div className="dp-farm-panel__content">
          <span className="dp-eyebrow">PROGRESSO</span>
          <h2>{audit.checked} / {audit.total}</h2>
          <p>{audit.progress}% concluido. Ultima leitura salva ha 18 segundos.</p>
          <ProgressBar value={audit.progress} />
          <button type="button" className="dp-primary-action" onClick={() => onNavigate('field')}><ScanIcon /> Conferir agora</button>
        </div>
      </section>

      <div className="dp-audit-actions">
        <button type="button" className="dp-audit-action dp-audit-action--primary" onClick={() => onNavigate('field')}>
          <ScanIcon />
          <span><strong>Auditar</strong><small>NFC ou tag manual</small></span>
        </button>
        <button type="button" className="dp-audit-action" onClick={() => onNavigate('lookup')}>
          <AnimalIcon />
          <span><strong>Consultar brinco</strong><small>Buscar tag pelo animal</small></span>
        </button>
        <button type="button" className="dp-audit-action" onClick={() => onNavigate('review')}>
          <IssuesIcon />
          <span><strong>Revisao</strong><small>{audit.review} itens pendentes</small></span>
        </button>
        <button type="button" className="dp-audit-action">
          <TagIcon />
          <span><strong>Ultimas leituras</strong><small>Ver conferencias recentes</small></span>
        </button>
      </div>

      <section className="dp-section dp-section--tight">
        <div className="dp-section-title">
          <span className="dp-eyebrow">CAMPO</span>
          <h2>Situacao atual</h2>
        </div>
        <div className="dp-metric-grid">
          <MetricCard label="Conferidas" value={audit.checked} icon={<CheckIcon />} />
          <MetricCard label="Revisar" value={audit.review} icon={<IssuesIcon />} tone="warning" />
          <MetricCard label="Sem tag" value={audit.withoutTag} icon={<AnimalIcon />} tone="danger" />
        </div>
      </section>
    </section>
  );
}

function NewAuditPreview({ onContinue }: { onContinue: () => void }) {
  return (
    <section className="dp-page">
      <div className="dp-section-title">
        <span className="dp-eyebrow">NOVA AUDITORIA</span>
        <h1>Criar fazenda</h1>
        <p>Fluxo visual em etapas para importar a base e validar o lote antes de ir para campo.</p>
      </div>

      <div className="dp-stepper" aria-label="Etapas">
        <Step active done number="1" label="Fazenda" />
        <Step active done number="2" label="Arquivo" />
        <Step active number="3" label="Conferir" />
      </div>

      <section className="dp-form-surface">
        <label className="dp-field">
          <span>Nome da fazenda</span>
          <input value="Santa Juliana" readOnly />
        </label>

        <button type="button" className="dp-file-target">
          <ImportIcon size={30} />
          <strong>Tags.xlsx</strong>
          <small>Arquivo Nedap selecionado para validacao</small>
        </button>

        <button type="button" className="dp-primary-action dp-primary-action--full" onClick={onContinue}>
          Continuar
        </button>
      </section>

      <section className="dp-known-smarttags">
        <div>
          <span className="dp-eyebrow">ANTES DA ORDENHA</span>
          <h2>Problemas com SmartTag</h2>
          <p>Registre tags que ja chegaram com alerta para o app avisar durante a conferencia.</p>
        </div>
        <button type="button" className="dp-secondary-action">Adicionar problema</button>
      </section>

      <section className="dp-validation-panel">
        <div className="dp-section-title dp-section-title--compact">
          <span className="dp-eyebrow">VALIDACAO</span>
          <h2>Resumo do arquivo</h2>
        </div>
        <div className="dp-validation-grid">
          <MiniMetric label="Total tags" value="355" />
          <MiniMetric label="Validas" value="351" tone="success" />
          <MiniMetric label="Suspeitas" value="3" tone="warning" />
          <MiniMetric label="Sem vinculo" value="1" tone="warning" />
          <MiniMetric label="Prefixo detectado" value="9840000" wide />
        </div>
      </section>
    </section>
  );
}

function LookupPreview() {
  return (
    <section className="dp-page dp-page--lookup">
      <div className="dp-section-title">
        <span className="dp-eyebrow">CONSULTA RAPIDA</span>
        <h1>Buscar por brinco</h1>
        <p>Atalho dentro da auditoria para conferir qual SmartTag esta cadastrada em um animal.</p>
      </div>

      <section className="dp-lookup-panel">
        <label className="dp-observed-field">
          <span>NUMERO DO BRINCO</span>
          <input value="4102" readOnly inputMode="numeric" />
        </label>
        <button type="button" className="dp-primary-action dp-primary-action--full">Buscar tag</button>
        <div className="dp-lookup-result">
          <span><AnimalIcon /></span>
          <div>
            <small>ANIMAL 4102</small>
            <strong>984000008891722</strong>
            <p>Status desta auditoria: tag movimentada, evidencia fisica confirmada.</p>
          </div>
        </div>
      </section>
    </section>
  );
}

function SettingsPreview() {
  return (
    <section className="dp-page dp-page--settings">
      <div className="dp-section-title">
        <span className="dp-eyebrow">CONFIGURACAO</span>
        <h1>Ajustes do BIPTAG</h1>
        <p>Tela mockada para concentrar ajustes, sincronizacao e estado do aplicativo em um lugar mais util.</p>
      </div>
      <div className="dp-settings-list">
        <DataStrip label="BANCO" value="Sincronizacao ativa" icon={<CloudIcon />} />
        <DataStrip label="NFC" value="Chrome Android pronto" icon={<ScanIcon />} />
        <DataStrip label="APP" value="Atualizacoes automaticas" icon={<ActionIcon />} />
      </div>
    </section>
  );
}

function Step({ active, done, number, label }: { active?: boolean; done?: boolean; number: string; label: string }) {
  return (
    <div className={`dp-step ${active ? 'is-active' : ''} ${done ? 'is-done' : ''}`}>
      <span>{done ? <CheckIcon size={14} /> : number}</span>
      <strong>{label}</strong>
    </div>
  );
}

function FieldPreview({ state, setState }: { state: FieldState; setState: (state: FieldState) => void }) {
  return (
    <section className="dp-page dp-page--field">
      <div className="dp-field-header">
        <div>
          <span className="dp-eyebrow">MODO CAMPO</span>
          <h1>{audit.farmName}</h1>
          <p>{audit.checked} / {audit.total} conferidas</p>
        </div>
        <strong>{audit.progress}%</strong>
      </div>
      <ProgressBar value={audit.progress} compact />

      <div className="dp-save-banner">
        <CheckIcon size={18} />
        <span>Leituras salvas automaticamente. Pode atualizar a pagina sem perder o que ja foi conferido.</span>
      </div>

      <div className="dp-field-kpis" aria-label="Resumo de campo">
        <span><strong>112</strong> pendentes</span>
        <span><strong>17</strong> revisar</span>
        <span><strong>4</strong> sem tag</span>
      </div>

      <div className="dp-state-switch" aria-label="Estados mockados">
        <PreviewNavButton active={state === 'waiting'} onClick={() => setState('waiting')}>NFC</PreviewNavButton>
        <PreviewNavButton active={state === 'read'} onClick={() => setState('read')}>Lida</PreviewNavButton>
        <PreviewNavButton active={state === 'correct'} onClick={() => setState('correct')}>Correta</PreviewNavButton>
        <PreviewNavButton active={state === 'divergence'} onClick={() => setState('divergence')}>Divergencia</PreviewNavButton>
      </div>

      {state === 'waiting' && <WaitingNfcState />}
      {state === 'read' && <ReadTagState />}
      {state === 'correct' && <CorrectTagState onNext={() => setState('waiting')} />}
      {state === 'divergence' && <DivergenceState />}

      <LatestConferences />
    </section>
  );
}

function WaitingNfcState() {
  return (
    <section className="dp-nfc-panel">
      <div className="dp-reader-status">
        <span />
        Leitor ativo
      </div>
      <div className="dp-radar">
        <span className="dp-radar__wave" />
        <span className="dp-radar__wave dp-radar__wave--delay" />
        <span className="dp-reader-asset" aria-hidden="true" />
      </div>
      <span className="dp-eyebrow">SMARTTAG</span>
      <h2>Aproxime a SmartTag</h2>
      <p>Mantenha o celular encostado no colar ate a leitura confirmar. A tela foi pensada para ver rapido, mesmo no sol.</p>
      <button type="button" className="dp-secondary-action dp-manual-action">Digitar tag manualmente</button>
    </section>
  );
}

function ReadTagState() {
  return (
    <section className="dp-read-panel">
      <div className="dp-panel-status">Leitura capturada</div>
      <DataStrip label="TAG LIDA" value="984000008891722" icon={<TagIcon />} />
      <DataStrip label="CADASTRO NEDAP" value="4101" icon={<AnimalIcon />} strong />
      <label className="dp-observed-field">
        <span>BRINCO OBSERVADO</span>
        <input value="4102" readOnly inputMode="numeric" />
      </label>
      <button type="button" className="dp-primary-action dp-primary-action--full">Confirmar brinco</button>
    </section>
  );
}

function CorrectTagState({ onNext }: { onNext: () => void }) {
  return (
    <section className="dp-result-panel dp-result-panel--success">
      <div className="dp-result-icon"><CheckIcon size={34} /></div>
      <span className="dp-eyebrow">TAG CORRETA</span>
      <h2>4101</h2>
      <p>Tag {shortTag('984000008891722')}</p>
      <button type="button" className="dp-success-action" onClick={onNext}>Proxima tag</button>
      <div className="dp-secondary-grid">
        <button type="button">Remover vinculo</button>
        <button type="button">Mais opcoes</button>
      </div>
    </section>
  );
}

function DivergenceState() {
  return (
    <section className="dp-decision-panel">
      <div className="dp-panel-status dp-panel-status--warning">Divergencia detectada</div>
      <span className="dp-eyebrow">CONFIRME O QUE ESTA VENDO</span>
      <h2>Esta tag esta realmente no animal 4102?</h2>
      <div className="dp-comparison">
        <DataStrip label="CADASTRO NEDAP" value="4101" icon={<CloudIcon />} />
        <DataStrip label="BRINCO INFORMADO" value="4102" icon={<AnimalIcon />} strong />
      </div>
      <button type="button" className="dp-primary-action dp-primary-action--full">Sim, estou no 4102</button>
      <button type="button" className="dp-secondary-action">Corrigir numero</button>
      <button type="button" className="dp-tertiary-action">Nao consegui confirmar</button>
    </section>
  );
}

function LatestConferences() {
  return (
    <section className="dp-section">
      <div className="dp-section-title dp-section-title--compact">
        <span className="dp-eyebrow">ULTIMAS CONFERENCIAS</span>
        <h2>Leituras recentes</h2>
      </div>
      <div className="dp-latest-list">
        {latestConferences.map((item) => (
          <div className="dp-latest-row" key={item.tag}>
            <span>
              <strong>{item.animal}</strong>
              <small>Tag {shortTag(item.tag)}</small>
            </span>
            <span>
              <small>{item.when}</small>
              <em>{item.status}</em>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function ReviewPreview() {
  return (
    <section className="dp-page">
      <div className="dp-review-header">
        <div>
          <span className="dp-eyebrow">REVISAO</span>
          <h1>12 precisam de atencao</h1>
          <p>Inbox operacional para decidir o que sera executado no Nedap depois da auditoria.</p>
        </div>
        <button type="button" className="dp-primary-action">Exportar</button>
      </div>

      <div className="dp-filter-row" aria-label="Filtros mockados">
        {['Todos', 'Movimentos', 'Nao confirmadas', 'Cadastro', 'Nao localizadas'].map((filter, index) => (
          <button type="button" className={index === 0 ? 'is-active' : ''} key={filter}>{filter}</button>
        ))}
      </div>

      <div className="dp-inbox-list">
        {reviewItems.map((item) => (
          <article className={`dp-inbox-item dp-inbox-item--${item.tone}`} key={item.type + item.title}>
            <div>
              <span>{item.type}</span>
              <strong>{item.title}</strong>
              <p>{item.detail}</p>
              <small>{item.note}</small>
            </div>
            <button type="button">Ver detalhes</button>
          </article>
        ))}
      </div>
    </section>
  );
}

function MetricCard({
  label,
  value,
  icon,
  tone = 'default'
}: {
  label: string;
  value: string | number;
  icon: ReactNode;
  tone?: 'default' | 'warning' | 'danger';
}) {
  return (
    <div className={`dp-metric-card dp-metric-card--${tone}`}>
      <span>{icon}</span>
      <small>{label}</small>
      <strong>{value}</strong>
    </div>
  );
}

function MiniMetric({
  label,
  value,
  tone = 'default',
  wide = false
}: {
  label: string;
  value: string;
  tone?: 'default' | 'success' | 'warning';
  wide?: boolean;
}) {
  return (
    <div className={`dp-mini-metric dp-mini-metric--${tone} ${wide ? 'dp-mini-metric--wide' : ''}`}>
      <small>{label}</small>
      <strong>{value}</strong>
    </div>
  );
}

function DataStrip({ label, value, icon, strong = false }: { label: string; value: string; icon: ReactNode; strong?: boolean }) {
  return (
    <div className={`dp-data-strip ${strong ? 'dp-data-strip--strong' : ''}`}>
      <span>{icon}</span>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
      </div>
    </div>
  );
}

function ProgressBar({ value, compact = false }: { value: number; compact?: boolean }) {
  return (
    <div className={`dp-progress ${compact ? 'dp-progress--compact' : ''}`} aria-label={`${value}% concluido`}>
      <span style={{ width: `${value}%` }} />
    </div>
  );
}

export default DesignPreview;
