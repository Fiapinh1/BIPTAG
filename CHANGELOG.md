# BIPTAG Web V0.2 — Field Workflow

## Principais mudanças

- Auditorias persistem no IndexedDB e podem ser retomadas dias depois.
- Botões de **Pausar**, **Retomar** e **Finalizar** auditoria.
- Histórico local das auditorias salvas no aparelho.
- Fluxo de campo guiado: o técnico confirma apenas o que vê fisicamente.
- Divergências não fecham mais automaticamente.
- Perguntas prontas para:
  - tag em outro animal;
  - animal fora da base;
  - tag sem vínculo;
  - tag não cadastrada;
  - leitura não confirmada.
- Removida a necessidade de observação textual no fluxo principal.
- Detecção automática de divergência recíproca como **possível troca de tags**.
- Aviso contextual quando um animal já está envolvido em ocorrência anterior.
- Releitura mantém histórico: o registro anterior não é apagado, apenas deixa de ser o registro atual.
- Números de tag e brinco maiores e interface otimizada para celular/uso com uma mão.
- `generateId()` com fallback para HTTP local, corrigindo `crypto.randomUUID is not a function`.
- Relatório Excel inclui decisão de campo, revisão e possível troca.
- Schema Supabase V0.2 preparado para backup/sincronização posterior.
