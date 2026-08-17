# BIPTAG - Funcionamento atual

Este documento descreve como o BIPTAG Web funciona hoje.

O BIPTAG e uma ferramenta de auditoria de SmartTags bovinas em campo. Ele nao corrige automaticamente o cadastro, nao altera o Nedap e nao executa nenhuma mudanca operacional sozinho. O objetivo e registrar evidencias, decisoes de campo e acoes futuras para que a correcao seja feita depois da auditoria, com base no relatorio final.

## Principio central

Durante a ordenha, o tecnico deve pensar o minimo possivel.

O fluxo do aplicativo e:

1. Ler a SmartTag via NFC ou teste manual.
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

## Leitura de SmartTag

Existem dois modos de leitura:

- NFC real, usando Web NFC no Chrome Android.
- Teste manual sem NFC, digitando a tag ou apenas o final da tag quando existe um padrao definido.

No modo manual, a area permanece aberta ate o usuario clicar em `Sair do modo manual`.

Ao ler uma tag, o sistema procura a SmartTag na base importada e mostra:

- numero da tag lida;
- animal cadastrado no Nedap, quando existir;
- avisos de tag ja conferida;
- avisos de relacao com ocorrencias anteriores;
- campo para informar o brinco observado.

## Confirmacao do brinco

Depois da leitura, o usuario informa o numero do brinco visto no animal.

Se o brinco informado for igual ao animal esperado no Nedap, a leitura recebe o status de tag correta.

Se o brinco for diferente, o sistema nao assume automaticamente que houve troca. Ele pergunta ao tecnico se aquele e realmente o brinco visto no animal.

As opcoes principais sao:

- confirmar o brinco visto;
- corrigir o numero digitado;
- registrar que nao conseguiu confirmar.

## Tag correta

Tag correta nao significa obrigatoriamente "sem acao".

Quando uma tag esta correta, o sistema mostra:

- `TAG CORRETA`;
- animal;
- tag;
- botoes de decisao operacional.

As opcoes atuais sao:

- `Proxima tag`: registra que a tag atual deve ser mantida.
- `Remover tag`: registra acao futura para remover o vinculo da tag no Nedap.
- `Substituir tag`: registra acao futura para substituir a tag do animal.
- `Adicionar observacao`: adiciona uma observacao ao relatorio mantendo a tag atual.

Essas decisoes aparecem no relatorio final.

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

As abas principais incluem:

- `Resumo`;
- `Resultado Final`;
- `Auditoria`;
- `Pendencias`;
- `Relatorio Operacional`;
- `Acoes Nedap`;
- `Pre-validacao`.

A aba `Relatorio Operacional` organiza as informacoes em secoes:

1. Tags corretas.
2. Trocas confirmadas.
3. Trocas pendentes.
4. Tags novas para cadastro.
5. Tags removidas.
6. Substituicoes de tag.
7. Conflitos de auditoria.
8. Conflitos de tag nova.
9. Tags nao localizadas.
10. Acoes para executar no Nedap.

A aba `Acoes Nedap` consolida as acoes futuras, como:

- trocar tags;
- remover tag;
- cadastrar nova tag;
- vincular tag;
- substituir tag;
- investigar ocorrencia;
- manter tag atual quando houver observacao.

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
