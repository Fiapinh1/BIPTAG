# BIPTAG - Funcionamento atual

Este documento descreve como o BIPTAG Web funciona hoje.

O BIPTAG e uma ferramenta de auditoria de SmartTags bovinas em campo. Ele nao corrige automaticamente o cadastro, nao altera o Nedap e nao executa nenhuma mudanca operacional sozinho. O objetivo e registrar evidencias, decisoes de campo e acoes futuras para que a correcao seja feita depois da auditoria, com base no relatorio final.

## Principio central

Durante a ordenha, o tecnico deve pensar o minimo possivel.

O fluxo do aplicativo e:

1. Escolher a leitura manual, pelo bastão Bluetooth ou pelo NFC do telefone e ler a SmartTag.
2. Mostrar o animal esperado conforme a base Nedap importada.
3. Digitar o brinco observado fisicamente no animal.
4. Confirmar apenas o fato visto em campo.
5. Registrar a ocorrencia.
6. Continuar para a proxima vaca.
7. Corrigir o Nedap somente depois, usando o relatorio.

O BIPTAG decide a classificacao da auditoria e cruza ocorrencias depois. O tecnico confirma o fato fisico.

## Base Nedap

A auditoria comeca com a importacao do arquivo `Tags.xlsx` original exportado do Nedap Now.

Na importacao, o sistema:

- le a coluna de numero da SmartTag;
- le o animal vinculado no Nedap;
- identifica o padrao das tags;
- valida tags suspeitas ou invalidas;
- identifica tags duplicadas;
- identifica animais com mais de uma tag;
- identifica tags sem animal vinculado;
- cria uma auditoria local persistida no aparelho.

A base importada e salva no IndexedDB do navegador. O app pode ser fechado e aberto depois sem perder a auditoria, desde que os dados do site nao sejam apagados.

Depois da criação, o app abre o Resumo da fazenda recém-criada. O Resumo mostra o andamento, os problemas conhecidos e uma lista pesquisável e rolável das tags da planilha, somente para visualização. Outras fazendas aparecem apenas na página inicial. A conferência começa pelo botão `Iniciar conferência` do Resumo.

## Leitura de SmartTag

Ao abrir `Auditar`, o usuário escolhe entre três telas de leitura:

- `Digitar manualmente`: informa a tag completa ou os dígitos finais quando existe um padrão definido.
- `Usar bastão Bluetooth`: recebe as tags do HHR5000SN autorizado no navegador.
- `Usar NFC do telefone`: lê tags NFC compatíveis com conteúdo NDEF no Chrome Android.

O botão `Trocar modo de conferência` retorna à escolha sem apagar os registros. O NFC é parado ao sair da tela do telefone. A conexão Bluetooth permanece ao abrir outras páginas do app; suas leituras só abrem a conferência quando o modo bastão está selecionado.

O ícone de Bluetooth no canto mostra verde quando conectado e cinza quando desconectado. Ao tocar nele, é possível consultar o bastão, conectar, desconectar ou escolher outro dispositivo.

Os pacotes Bluetooth são reunidos antes de abrir a conferência. O app aceita uma SmartTag apenas quando recebeu a quantidade de dígitos configurada na auditoria (normalmente 15), preservando zeros e o prefixo original. Mensagens curtas de estado e transmissões incompletas não abrem a confirmação de padrão. CR, LF, NUL e ETX encerram a mensagem; sem terminador, o app aguarda 250 ms sem novos pacotes antes de aceitar um identificador completo. Fragmentos incompletos expiram após dois segundos sem dados e também são descartados ao desconectar. O app não completa números faltantes nem corta uma sequência longa para fazê-la caber no padrão.

Após a primeira conexão, o app tenta reconectar ao mesmo bastão se houver uma queda, com intervalos de até 15 segundos e enquanto a página estiver visível. Ao reabrir o app, a reconexão depende de o navegador disponibilizar os dispositivos já autorizados (`getDevices`). Quando essa função não existe ou a permissão foi removida, o usuário conecta pelo botão. Desconectar manualmente interrompe as tentativas automáticas, inclusive após reabrir o app.

O pedido de acesso ao Bluetooth/NFC ocorre no próprio toque em conectar/ativar. O navegador e o Android controlam essas permissões; o site não consegue ligar as antenas nem liberar uma permissão bloqueada pelo usuário. A interface oferece ajuda recolhida com orientações do Chrome, Dispositivos próximos, permissões do site e posicionamento da antena NFC. Bloqueios de permissão e ausência do serviço Bluetooth esperado interrompem as tentativas automáticas e exibem a causa. Falhas transitórias de conexão continuam permitindo reconexão. Na ativação do NFC, há opção de cancelar enquanto aguarda; erros de permissão, hardware e leitor ocupado recebem orientações específicas. A existência da API NFC no navegador não comprova disponibilidade do hardware ou compatibilidade da tag.

Uma leitura nova não substitui uma conferência ou decisão em andamento. É necessário terminar ou cancelar a tag atual antes de ler outra.

Na espera por leituras, `Reiniciar NFC` abre uma nova sessão e encerra a anterior; `Reconectar bastão` refaz a conexão autorizada. Cancelar uma ativação libera a próxima tentativa imediatamente. Respostas atrasadas de conexões antigas não podem desligar a sessão atual. A solicitação de acesso ao leitor ocorre antes do feedback sonoro; falhas de áudio ou vibração não interrompem a leitura nem o avanço após salvar. Uma falha ao atualizar o estado local da auditoria também não desliga um NFC que já iniciou.

Em `Configurações → Acesso aos leitores`, qualquer aparelho pode solicitar autorização e testar os leitores sem criar uma auditoria ou entrar em uma conta. Os botões invocam o seletor Bluetooth e a ativação NFC no próprio toque; o navegador controla se precisa exibir um pedido de permissão. O teste não grava conferências. A tela informa o navegador, a abertura pelo ícone instalado e a permissão NFC quando o navegador permite consultar esse estado. Indisponibilidade da API é distinguida de permissão negada. Há opção de abrir o app no Chrome Android e copiar um diagnóstico sem dados das auditorias. Se o bastão não aparecer na busca normal, `Procurar todos` usa um seletor sem filtro por nome, mantendo o acesso ao serviço de leitura esperado.

A conferência mostra duas barras: `Tags lidas` conta SmartTags distintas registradas em campo, incluindo as que não constam na planilha, e informa quantas estão fora da base; `Planilha` mantém o progresso dos identificadores exatos importados e o número de restantes. Releituras e correções da mesma tag não aumentam a primeira contagem. Marcar uma tag não localizada também não conta como leitura física. Assim, dez tags lidas podem coexistir com nove de dez identificadores da planilha conferidos quando um número foi cadastrado incorretamente.

Ao ler uma tag, o sistema procura a SmartTag na base importada e mostra:

- numero da tag lida;
- animal cadastrado no Nedap, quando existir;
- avisos de tag ja conferida;
- avisos de relacao com ocorrencias anteriores;
- campo para informar o brinco observado.

## Confirmacao do brinco

Depois da leitura, o usuario informa o numero do brinco visto no animal.

Quando a tag não existe na base e há uma SmartTag do mesmo animal com exatamente um dígito diferente, o app alerta `Possível erro de digitação na planilha`, mostra os dois números e destaca o dígito divergente. A regra também considera números que passaram na validação de formato. Havendo mais de um candidato, todos são mostrados. A confirmação preserva a tag física lida e registra os candidatos na observação do histórico, sem corrigir a planilha automaticamente. Alterar o brinco observado refaz essa comparação.

Os avisos de pré-validação são apresentados por tipo, em grupos recolhidos, tanto no preparo quanto na Revisão. Linhas sem SmartTag com animal informado são identificadas como número ausente/inválido e incluem a linha original do Excel. Linhas sem tag nem animal são ignoradas. Apenas identificadores com formato utilizável entram no aviso de múltiplas tags; repetições da mesma tag geram aviso de duplicidade, sem inventar outro identificador para o animal. O resumo conta identificadores e animais distintos, sem inflar os totais com linhas repetidas.

Se o brinco informado for igual ao animal esperado no Nedap, a leitura recebe o status de tag correta.

Se o brinco for diferente, o sistema nao assume automaticamente que houve troca. Ele pergunta ao tecnico se aquele e realmente o brinco visto no animal.

As opcoes principais sao:

- confirmar o brinco visto;
- corrigir o numero digitado;
- registrar que nao conseguiu confirmar.

## Tag correta

Quando o brinco informado coincide com o cadastro, um único toque em `Conferir brinco` salva a evidência como correta e mantém a tag. O aviso verde `Tag correta e salva` aparece por alguns segundos, sem bloquear a próxima leitura e sem outra confirmação.

Os detalhes continuam acessíveis no aviso e nas últimas conferências. Ali é possível corrigir o brinco da última leitura e abrir `Ações desta tag` para remover vínculo, substituir tag, adicionar observação ou marcar fora de uso. Uma observação preserva a ação operacional já escolhida.

As ações opcionais só podem alterar uma leitura correta ainda atual, da auditoria aberta. Elas atualizam o estado efetivo da tag e o relatório sem criar outra evidência física. Leituras antigas substituídas ou auditorias finalizadas não são alteradas.

Resultados confirmados usam verde, pendências usam amarelo e conflitos usam vermelho. Divergências continuam exigindo confirmação do brinco físico antes de serem salvas.

## Status de auditoria

Os principais status registrados hoje sao:

- `correct`: brinco visto confere com o animal cadastrado.
- `reassignment` / `divergence`: tag encontrada em animal diferente do cadastro.
- `possible_swap`: troca reciproca confirmada pela auditoria.
- `audit_conflict`: conflito de auditoria com troca ja confirmada.
- `new_tag`: SmartTag nao cadastrada encontrada em um animal.
- `new_tag_conflict`: mesma SmartTag nova registrada em mais de um animal.
- `linked`: tag sem vinculo no Nedap confirmada em um animal existente.
- `tag_not_registered`: tag nao existe na base importada.
- `tag_without_animal`: tag existe, mas sem animal vinculado.
- `animal_not_in_base`: brinco observado nao aparece na base importada.
- `tag_not_found`: SmartTag valida da base nao foi localizada durante a auditoria.
- `unconfirmed`: leitura nao confirmada em campo.
- `suspicious_tag`: tag suspeita na base.
- `possible_typo`: possivel erro de digitacao ou prefixo.

## Acoes operacionais

Cada leitura pode gerar uma acao operacional para ser executada depois no Nedap.

As acoes atuais sao:

- `MANTER TAG ATUAL`;
- `REMOVER TAG`;
- `SUBSTITUIR TAG`;
- `CADASTRAR NOVA TAG`;
- `VINCULAR TAG`;
- `TROCAR TAGS`;
- `MOVIMENTACAO DE TAG`;
- `INVESTIGAR`.

Essas acoes nao sao executadas automaticamente. Elas sao apenas registradas para o relatorio.

## Trocas confirmadas

O sistema detecta troca reciproca.

Exemplo:

```text
Tag A
Animal original: 717
Animal observado: 907

Tag B
Animal original: 907
Animal observado: 717
```

Resultado:

```text
717 <-> 907
```

As duas leituras passam a ficar relacionadas como `possible_swap`, e a acao operacional sugerida e `TROCAR TAGS`.

## Conflito de auditoria

Um animal ou uma tag nao pode participar de duas trocas confirmadas ao mesmo tempo.

Exemplo:

```text
Troca existente:
717 <-> 907

Nova tentativa:
717 <-> 288
```

Resultado:

```text
CONFLITO_AUDITORIA
```

O sistema nao substitui a troca anterior e nao fecha uma nova troca automaticamente. A nova ocorrencia fica registrada para revisao, mantendo o historico completo.

## Conflito de tag nova

Quando uma SmartTag nao cadastrada aparece em um animal, o sistema registra como tag nova.

Se a mesma SmartTag nova aparecer depois em outro animal, o sistema nao substitui silenciosamente o primeiro registro.

Exemplo:

```text
Tag nova: 984000099999999
Primeiro animal: 4454
Novo animal: 288
```

Resultado:

```text
CONFLITO_TAG_NOVA
```

A mensagem indica que a mesma SmartTag nao cadastrada ja foi registrada anteriormente e que a validacao manual e necessaria.

## Tag removida

Quando uma tag correta e removida durante a auditoria, o tecnico deve usar a opcao `Remover tag`.

O sistema registra:

```text
Acao: REMOVER TAG
Animal: animal observado
Tag: SmartTag lida
```

No relatorio, isso vira uma acao futura para remover o vinculo da tag no Nedap.

## Movimentacao de tag

Se uma tag marcada para remocao aparece depois em outro animal, o sistema registra uma movimentacao de tag.

Exemplo:

```text
Origem:
Animal 717
Tag removida

Destino:
Mesmo colar aparece no animal 4454
```

Resultado:

```text
MOVIMENTACAO DE TAG
```

Acao sugerida:

```text
Remover vinculo do animal 717.
Vincular a SmartTag ao animal 4454.
```

## Pendencias

A tela de pendencias mostra:

- trocas confirmadas;
- trocas pendentes;
- conflitos de auditoria;
- conflitos de tag nova;
- outras ocorrencias;
- tags deslocadas;
- tags nao localizadas.

Essa tela serve para acompanhamento durante e depois da auditoria.

## Relatorio final

O relatorio Excel e operacional. Ele nao mostra apenas problemas; ele mostra o que aconteceu, o que foi decidido em campo e o que precisa ser feito depois.

O arquivo usa quatro abas:

- `RESULTADO FINAL`: fazenda, datas de início e fim e uma linha por tag. As cinco colunas são `SMARTTAG`, `ANIMAL NEDAP`, `ANIMAL CAMPO`, `RESULTADO` e `ULTIMA CONFIRMACAO`.
- `CORRIGIR NO NEDAP`: as mesmas cinco colunas, com os resultados finais que precisam de atenção. Tags corretas, ainda não conferidas ou guardadas sem necessidade de alterar o cadastro ficam fora dessa lista.
- `HISTORICO`: todas as leituras em ordem, inclusive as anteriores a uma correção, com as observações.
- `ANIMAIS SEM TAG`: animal e SmartTag original dos animais que terminaram sem tag confirmada.

O resultado resume a ação em uma frase, como `CORRETO`, `MOVER 336 -> 337`, `TAG NÃO ENCONTRADA` ou `CADASTRAR TAG -> 402`. Linhas corretas ficam verdes; resultados que exigem atenção ficam amarelos. As SmartTags são exportadas como texto, sem notação científica.

Na Revisão, as tags ainda sem resultado e as marcadas como não localizadas aparecem em listas com o número completo, o animal da base, busca e rolagem.

## Persistencia local

O app usa IndexedDB com Dexie.

Ficam salvos localmente:

- auditorias;
- base importada;
- leituras;
- historico de releituras;
- atribuicoes efetivas;
- pendencias;
- decisoes operacionais;
- status de sincronizacao.

O app pode funcionar em campo sem internet depois de carregado, mas o usuario nao deve limpar os dados do site no navegador.

## Supabase

O projeto possui schema e migration para Supabase.

O sync envia registros de auditoria, incluindo:

- status;
- decisao de campo;
- acao operacional;
- observacao da acao;
- datas;
- status de sincronizacao.

O arquivo `supabase/schema.sql` representa o modelo atual.

A migration `supabase/migrations/20260817130405_add_operational_audit_fields.sql` adiciona suporte aos novos campos e ao status `new_tag_conflict` em bancos existentes.

## Limites atuais

O BIPTAG ainda nao executa alteracoes no Nedap.

Tambem nao substitui uma revisao humana quando ha conflito. Em conflitos, o comportamento correto e registrar evidencias e mandar investigar antes de qualquer correcao.

O objetivo atual e ser uma ferramenta confiavel de auditoria e geracao de acoes, reproduzindo e melhorando o processo que antes era feito em planilha.
