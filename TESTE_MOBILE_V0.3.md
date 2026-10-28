# BIPTAG V0.3 - roteiro de teste mobile

Use este roteiro no Chrome Android, preferencialmente com o app publicado em HTTPS.
O endereço local HTTP serve para testar interface, digitação manual, importação, IndexedDB e relatório. No celular, Bluetooth e NFC reais exigem HTTPS e navegador compatível.

## Ambiente

- [ ] Abrir o BIPTAG no Chrome Android.
- [ ] Confirmar que a tela nao corta na largura do celular.
- [ ] Confirmar que a logo aparece no início e no ícone do PWA; a conferência usa um cabeçalho compacto com a fazenda.
- [ ] Confirmar que o app pode ser instalado na tela inicial.
- [ ] Confirmar que o modo instalado abre em retrato.
- [ ] Confirmar que os botoes principais tem area de toque confortavel.

## Importacao

- [ ] Importar o `Tags.xlsx` original do Nedap.
- [ ] Confirmar nome da fazenda.
- [ ] Confirmar pre-validacao da planilha.
- [ ] Verificar que os avisos estão agrupados por tipo e que números ausentes/inválidos não recebem o título de animal com múltiplas tags.
- [ ] Conferir uma linha com animal e sem tag: o aviso deve indicar o animal e a linha do Excel. Linhas sem tag nem animal devem ser ignoradas.
- [ ] Confirmar prefixo e quantidade de digitos da SmartTag.
- [ ] Salvar auditoria no aparelho.
- [ ] Confirmar que a criação abre o Resumo da fazenda recém-criada, inclusive quando já existem outras fazendas salvas.
- [ ] Confirmar que o Resumo não lista outras fazendas.
- [ ] Rolar `Tags da planilha` até o final, buscar por tag e por animal, e confirmar que a lista é somente para visualização.
- [ ] Fechar e abrir o navegador.
- [ ] Confirmar que a auditoria continua disponivel sem importar novamente.

## Teste manual sem NFC

- [ ] Abrir `Auditar`.
- [ ] Escolher `Digitar manualmente` e confirmar que não aparecem controles de NFC ou um painel grande do bastão.
- [ ] Digitar somente o final da tag quando houver prefixo definido.
- [ ] Confirmar que o app monta a tag completa corretamente.
- [ ] Simular outra tag sem sair do modo manual.
- [ ] Usar `Trocar modo de conferência` e confirmar que o campo limpa e os registros anteriores permanecem salvos.

## Navegação e botões

- [ ] No resumo da fazenda, usar `Voltar ao início` e confirmar que abre a lista, mantendo a auditoria salva.
- [ ] Em Consultar e Revisão, conferir os botões `Voltar` com destino e `Início` no topo. Em Auditar, esses botões grandes não devem aparecer; os retornos ficam em `Opções`.
- [ ] Abrir o resumo de uma fazenda com muitas tags: o menu deve estar visível antes de rolar e continuar no mesmo lugar ao rolar até o fim.
- [ ] Repetir a verificação em Revisão, Configurações e Conferência manual, sem botões da página cobertos pelo menu.
- [ ] Abrir o teclado no campo do brinco e conferir que a área de leitura pode rolar acima do menu, mantendo os atalhos de páginas disponíveis.
- [ ] Abrir Configurações a partir de Consultar e usar Voltar: deve retornar à Consulta da mesma fazenda.
- [ ] Iniciar uma leitura e digitar o brinco; em `Opções → Ir para início`, escolher `Continuar conferindo` e conferir que os dados digitados continuam na tela.
- [ ] Salvar uma tag correta e voltar ao resumo: não pedir uma nova confirmação nem perder o registro salvo.
- [ ] Em telas de 320 e 390 px, verificar que `Consultar` e `Revisão` aparecem completos e que nenhum botão está coberto pelo menu inferior.
- [ ] Navegar pelo teclado e conferir o foco visível nos botões de retorno e do menu.

## Bastão Bluetooth

- [ ] Em um aparelho novo, abrir `Configurações → Acesso aos leitores` pelo ícone instalado. Conferir o navegador identificado e testar `Autorizar e selecionar bastão` sem criar uma auditoria.
- [ ] Se a busca normal não listar o bastão, testar `Bastão não aparece? Procurar todos` e selecionar apenas o leitor desejado.
- [ ] Desconectar o bastão do primeiro celular e testar a autorização no segundo. A conexão em um aparelho não comprova a permissão no outro.
- [ ] Testar `Autorizar e testar NFC`, ler uma tag e conferir que o teste não cria registros na auditoria. Sair de Configurações deve encerrar o teste NFC.
- [ ] Verificar os estados NFC permitida, bloqueada, aguardando autorização e não informada. Se o navegador não oferece NFC, mostrar indisponibilidade sem simular um pedido de permissão.
- [ ] No ícone instalado em Android, conferir o atalho para abrir o app no Chrome e o botão `Copiar diagnóstico`.

- [ ] Em HTTPS, escolher `Usar bastão Bluetooth` e conectar o HHR5000SN.
- [ ] Negar o acesso ao Bluetooth no navegador/Android e verificar a orientação sobre Dispositivos próximos e permissões do site, sem tentativas automáticas repetidas enquanto o acesso estiver bloqueado.
- [ ] Restaurar a permissão, tocar em conectar e confirmar que funciona sem reiniciar a auditoria.
- [ ] Confirmar que o ícone no canto fica verde e que os detalhes só aparecem ao tocar nele.
- [ ] Ler a tag com transmissão fragmentada: a tela deve aguardar todos os dígitos, mostrando a SmartTag completa da etiqueta.
- [ ] Confirmar que mensagens curtas do bastão (por exemplo `2`) não abrem `Confirmar leitura?` nem exigem cancelar para tentar novamente.
- [ ] Interromper uma transmissão, aguardar mais de dois segundos e repetir a leitura: o fragmento antigo não pode entrar no número novo.
- [ ] Desconectar durante uma leitura parcial, reconectar e conferir que só uma nova tag completa chega à conferência.
- [ ] Ler uma tag completa com prefixo diferente: deve continuar pedindo confirmação de padrão, com todos os dígitos originais preservados.
- [ ] Ler uma tag e manter o campo do brinco aberto; ler outra tag e confirmar que a primeira não é substituída.
- [ ] Confirmar o brinco e finalizar a decisão antes de ler a próxima tag.
- [ ] Desligar e ligar o mesmo bastão, mantendo o app visível; aguardar a reconexão sem um novo seletor de dispositivos.
- [ ] Abrir `Consultar` e `Revisão`, retornar a `Auditar` e confirmar que a conexão foi mantida.
- [ ] Confirmar que leituras do bastão não interrompem os modos manual e telefone.
- [ ] Reabrir o app e verificar a reconexão quando `getDevices` estiver disponível no navegador.
- [ ] Desconectar pelo ícone, reabrir o app e confirmar que não reconecta até tocar em conectar.
- [ ] Testar o menu `Escolher outro bastão` e o cancelamento do seletor.
- [ ] Cancelar uma conexão Bluetooth pendente e tocar em conectar novamente: a tentativa anterior não pode deixar o botão sem efeito nem desconectar a conexão nova ao terminar atrasada.
- [ ] Com o bastão conectado, testar `Reconectar bastão` e conferir a próxima tag sem reiniciar a auditoria.

## NFC do telefone

- [ ] Escolher `Usar NFC do telefone` e ativar a leitura com uma tag NFC compatível com NDEF.
- [ ] Com NFC ativo, tocar em `Reiniciar NFC`: a leitura anterior deve parar e uma nova ativação deve ficar disponível, sem fechar a auditoria.
- [ ] Bloquear som/vibração no aparelho e conferir que isso não impede conectar, ler ou salvar a próxima tag.
- [ ] Na primeira ativação, permitir o acesso ao NFC solicitado pelo navegador. Se negar, verificar a mensagem com instruções para liberar a permissão do site.
- [ ] Enquanto a ativação estiver aguardando, cancelar e ativar novamente. Uma resposta atrasada da tentativa cancelada não pode reativar o leitor nem interferir na nova tentativa.
- [ ] Em navegador sem Web NFC ou acesso sem HTTPS, verificar que a ativação fica indisponível e oferece orientação para abrir no Chrome em HTTPS.
- [ ] No Galaxy Z Flip, conferir a posição da antena indicada pelo fabricante e testar a mesma tag com a tela desbloqueada e sem capa grossa/magnética.
- [ ] Confirmar que não aparecem os controles de conexão Bluetooth no painel principal.
- [ ] Confirmar que erros de leitura aparecem na tela.
- [ ] Usar `Parar NFC` ou trocar para outro modo e confirmar que eventos do NFC não abrem uma conferência.
- [ ] Testar a leitura, o brinco e as decisões em um celular de tela pequena, com e sem o teclado aberto, sem cartões sobrepostos ou botões cortados.

## Tag correta

- [ ] Ler ou simular uma tag que exista na base.
- [ ] Digitar o mesmo brinco do cadastro Nedap.
- [ ] Tocar `Conferir brinco` uma vez e confirmar o aviso verde `Tag correta e salva`, sem pedir para manter a tag novamente.
- [ ] Confirmar que a próxima leitura fica disponível imediatamente, inclusive antes de o aviso desaparecer.
- [ ] Pressionar Enter duas vezes rapidamente e confirmar que existe somente uma leitura salva.
- [ ] Abrir `Detalhes` do aviso ou da última conferência e testar `Corrigir última leitura`.
- [ ] Em `Ações desta tag`, testar `Remover vínculo`, `Substituir tag`, `Adicionar observação` e `Tag fora de uso`.
- [ ] Confirmar que as ações atingem a tag selecionada, mesmo quando outra já foi conferida depois.
- [ ] Adicionar observação a uma tag com remoção registrada e confirmar que a remoção continua no relatório.

## Possível erro de digitação e contagens

- [ ] Importar `984000009256954` no animal 751, ler `984000009156954` e informar o brinco 751. O app deve mostrar os dois números e destacar o dígito diferente antes de salvar.
- [ ] Informar outro animal: não sugerir erro de digitação com base apenas na semelhança do número.
- [ ] Confirmar que salvar preserva a tag lida, mantém a base original e inclui os candidatos na observação do histórico exportado.
- [ ] Com dez tags da base, ler nove delas e uma tag fora da planilha: conferir `10 tags lidas`, `1 fora da planilha`, `Planilha: 9 de 10` e `1 restante`.
- [ ] Reler ou corrigir a mesma tag: a contagem de tags distintas não pode aumentar. Marcar pendentes como não localizadas também não aumenta essa contagem.

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

- [ ] Ver as tags completas e os animais na lista de tags ainda sem resultado antes de marcar como não localizadas.
- [ ] Depois da marcação, confirmar que a lista `Tags não localizadas` contém as mesmas tags, sem duplicação, com busca e rolagem.
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
- [ ] Confirmar as abas, nesta ordem: `CORRIGIR NO NEDAP`, `REVISAR`, `CONFERÊNCIA`, `RESUMO`.
- [ ] Confirmar que `CORRIGIR NO NEDAP` contém somente ações do estado final, sem `MANTER TAG`, leituras não confirmadas ou tags não localizadas.
- [ ] Confirmar que uma troca recíproca aparece como uma única operação `TROCAR TAGS`.
- [ ] Confirmar que `REVISAR` mostra somente itens que ainda precisam de investigação.
- [ ] Confirmar que `CONFERÊNCIA` mantém todas as leituras em ordem, inclusive eventos anteriores à correção, com origem e observações.
- [ ] Confirmar que `RESUMO` contém os indicadores da auditoria e que as SmartTags são exportadas como texto, sem notação científica.

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
