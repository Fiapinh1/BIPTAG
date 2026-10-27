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

## Bastão Bluetooth

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

## NFC do telefone

- [ ] Escolher `Usar NFC do telefone` e ativar a leitura com uma tag NFC compatível com NDEF.
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
- [ ] Confirmar as abas:
  - RESULTADO FINAL
  - CORRIGIR NO NEDAP
  - HISTORICO
  - ANIMAIS SEM TAG
- [ ] Confirmar que `RESULTADO FINAL` começa com a fazenda e as datas de início e fim e usa apenas `SMARTTAG`, `ANIMAL NEDAP`, `ANIMAL CAMPO`, `RESULTADO` e `ULTIMA CONFIRMACAO`.
- [ ] Confirmar que as tags corretas ficam verdes e os demais resultados ficam amarelos, com os números completos como texto.
- [ ] Confirmar que `CORRIGIR NO NEDAP` contém somente os resultados finais que exigem atenção, incluindo tags não encontradas, sem tags corretas ou ainda não conferidas.
- [ ] Confirmar que o histórico mantém todas as leituras em ordem e as observações, enquanto o resultado final usa apenas o estado final de cada tag.

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
