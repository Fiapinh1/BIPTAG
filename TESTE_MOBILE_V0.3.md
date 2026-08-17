# BIPTAG V0.3 - roteiro de teste mobile

Use este roteiro no Chrome Android, preferencialmente com o app publicado em HTTPS.
O endereco local HTTP serve para testar interface, importacao, IndexedDB e relatorio, mas Web NFC real depende de Chrome Android com HTTPS.

## Ambiente

- [ ] Abrir o BIPTAG no Chrome Android.
- [ ] Confirmar que a tela nao corta na largura do celular.
- [ ] Confirmar que a logo aparece no topo e no icone do PWA.
- [ ] Confirmar que o app pode ser instalado na tela inicial.
- [ ] Confirmar que o modo instalado abre em retrato.
- [ ] Confirmar que os botoes principais tem area de toque confortavel.

## Importacao

- [ ] Importar o `Tags.xlsx` original do Nedap.
- [ ] Confirmar nome da fazenda.
- [ ] Confirmar pre-validacao da planilha.
- [ ] Confirmar prefixo e quantidade de digitos da SmartTag.
- [ ] Salvar auditoria no aparelho.
- [ ] Fechar e abrir o navegador.
- [ ] Confirmar que a auditoria continua disponivel sem importar novamente.

## Teste manual sem NFC

- [ ] Abrir `Auditar`.
- [ ] Abrir `Teste manual sem NFC`.
- [ ] Digitar somente o final da tag quando houver prefixo definido.
- [ ] Confirmar que o app monta a tag completa corretamente.
- [ ] Simular outra tag sem sair do modo manual.
- [ ] Usar `Sair do modo manual` e confirmar que o campo limpa.

## Tag correta

- [ ] Ler ou simular uma tag que exista na base.
- [ ] Digitar o mesmo brinco do cadastro Nedap.
- [ ] Confirmar que aparece `TAG CORRETA`.
- [ ] Confirmar que a mensagem nao some sozinha antes da decisao.
- [ ] Tocar `Proxima tag` e confirmar que volta para leitura.
- [ ] Repetir e testar `Remover vinculo`.
- [ ] Repetir e testar `Substituir tag`.
- [ ] Repetir e testar `Mais opcoes > Adicionar observacao`.
- [ ] Repetir e testar `Mais opcoes > Tag fora de uso`.

## Divergencia

- [ ] Ler tag cadastrada no animal A.
- [ ] Digitar brinco observado B.
- [ ] Confirmar que o app pergunta somente se voce esta vendo B.
- [ ] Tocar `Sim, estou no B`.
- [ ] Confirmar que registra e prepara a proxima leitura.
- [ ] Repetir e testar `Digitei o brinco errado`.
- [ ] Repetir e testar `Nao consegui confirmar`.
- [ ] Repetir e testar `Ler outra tag`.

## Troca reciproca

- [ ] Ler tag do animal A e informar animal B.
- [ ] Ler tag do animal B e informar animal A.
- [ ] Confirmar que o app mostra uma confirmacao breve de troca relacionada.
- [ ] Confirmar que os detalhes aparecem em `Revisao > Trocas confirmadas`.
- [ ] Confirmar que a acao sugerida e `TROCAR TAGS`.

## Conflito de auditoria

- [ ] Criar uma troca confirmada A <-> B.
- [ ] Depois registrar tentativa A <-> C.
- [ ] Confirmar que nao sobrescreve a troca anterior.
- [ ] Confirmar que aparece em `Conflitos de auditoria`.
- [ ] Confirmar que a acao no relatorio e investigar antes de mexer no Nedap.

## Tag nova

- [ ] Ler ou simular uma SmartTag que nao esta na base.
- [ ] Informar o brinco observado.
- [ ] Confirmar que a acao sugerida e `CADASTRAR TAG`.
- [ ] Repetir a mesma tag em outro animal.
- [ ] Confirmar `Conflito de tag nova`.
- [ ] Confirmar que o primeiro registro nao foi substituido silenciosamente.

## Tag sem vinculo

- [ ] Ler tag existente na base sem animal vinculado.
- [ ] Informar o brinco observado.
- [ ] Confirmar que a acao sugerida e `VINCULAR TAG`.
- [ ] Confirmar que aparece em `Revisao > Tags sem vinculo`.

## Problemas conhecidos

- [ ] Abrir `Inicio > Problemas conhecidos antes da ordenha`.
- [ ] Adicionar tag com tipo `NEVER SENT DATA`.
- [ ] Adicionar tag com tipo `DE TRAS PARA FRENTE`.
- [ ] Editar uma observacao.
- [ ] Remover um item.
- [ ] Ler uma tag cadastrada como problema conhecido.
- [ ] Confirmar que aparece o alerta no modo campo.
- [ ] Confirmar que a auditoria continua normalmente.
- [ ] Confirmar que aparece em `Revisao > Problemas conhecidos`.

## Revisao

- [ ] Confirmar as secoes:
  - Tags corretas mantidas
  - Trocas confirmadas
  - Trocas pendentes
  - Tags movimentadas
  - Substituicoes de tag
  - Tags novas
  - Tags removidas
  - Tags sem vinculo
  - Animais sem tag
  - Conflitos de auditoria
  - Conflitos de tag nova
  - Nao confirmadas
  - Tags nao localizadas
  - Problemas conhecidos
  - Acoes para executar no Nedap
- [ ] Tocar `Ver detalhes` em pelo menos 3 tipos diferentes.
- [ ] Confirmar que nao aparecem enums tecnicos como `audit_conflict` ou `reassignment`.

## Relatorio Excel

- [ ] Exportar relatorio.
- [ ] Confirmar que o arquivo abre no celular ou computador.
- [ ] Confirmar as abas:
  - Acoes Nedap
  - Resumo
  - Pendencias
  - Evidencias Campo
  - Pre-validacao
- [ ] Confirmar que `Acoes Nedap` e a primeira aba.
- [ ] Confirmar que conflitos e problemas conhecidos aparecem no relatorio.
- [ ] Confirmar que evidencias de campo mantem historico cronologico.

## Offline e persistencia

- [ ] Desligar internet do celular.
- [ ] Abrir auditoria ja importada.
- [ ] Simular leitura manual.
- [ ] Registrar uma ocorrencia.
- [ ] Fechar o navegador.
- [ ] Abrir novamente.
- [ ] Confirmar que a ocorrencia continua salva.
- [ ] Ligar internet.
- [ ] Se Supabase estiver configurado, testar sincronizacao manual.

## Web NFC real

- [ ] Abrir URL HTTPS no Chrome Android.
- [ ] Ligar NFC do aparelho.
- [ ] Tocar `Ativar leitor NFC`.
- [ ] Aceitar permissao do navegador.
- [ ] Aproximar SmartTag real.
- [ ] Confirmar bip sonoro ou vibracao, quando permitido pelo aparelho.
- [ ] Confirmar que o numero NDEF aparece como `TAG LIDA`.
- [ ] Confirmar que o teclado nao cobre informacoes importantes depois da leitura.

## Criterio de aceite

- [ ] O tecnico consegue registrar leituras sem decidir correcao do Nedap durante a ordenha.
- [ ] Nenhum conflito sobrescreve evidencia anterior.
- [ ] O app continua funcional offline.
- [ ] O relatorio final deixa claro o que fazer no Nedap depois.
- [ ] Nao houve corte visual em celular Android pequeno.
