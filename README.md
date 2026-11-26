# BIPTAG Web — V0.3 Field Workflow

BIPTAG é uma PWA para cadastrar SmartTags em campo sem planilha e auditar vínculos usando a planilha `Tags.xlsx` exportada do Nedap Now. As leituras podem ser feitas por Web NFC, bastão Bluetooth compatível ou digitação, com confirmação visual do brinco.

## Stack

- React + TypeScript + Vite
- PWA / Service Worker
- Web NFC (`NDEFReader`)
- IndexedDB com Dexie
- SheetJS para importar/exportar Excel
- Supabase preparado para backup/sincronização
- GitHub + Vercel para deploy

## Regra central do modo campo

### Cadastro inicial sem planilha

Na página inicial, **Cadastrar novas tags** abre um modo independente da auditoria. Crie ou escolha uma fazenda, leia a SmartTag por NFC/Bluetooth ou digite seus 15 dígitos, informe o brinco e toque em **Salvar e adicionar próximo**. O cadastro só é confirmado depois desse toque; uma leitura seguinte não substitui a tag em preenchimento.

- Os vínculos ficam nas tabelas locais `registrationFarms` e `registeredTags`. Eles não criam ocorrências nem alteram a base de uma auditoria.
- Cada fazenda permite um vínculo por tag e um por animal. Zeros, números incompletos e duplicações são bloqueados na gravação, inclusive com envios simultâneos.
- A aba **Cadastros** permite buscar vínculos, corrigir a tag ou o animal com confirmação e exportar um Excel com SmartTag, animal e data do cadastro. A correção conserva o vínculo anterior no histórico local.
- O último rascunho de cada fazenda é restaurado ao reabrir a tela. Uma ativação NFC exige novo toque ao retomar; a conexão Bluetooth segue o comportamento existente do leitor.
- Após carregar o app com internet, o modo funciona offline. Os novos cadastros ficam **somente neste aparelho** nesta versão; a sincronização de auditorias com Supabase não inclui essas tabelas. Use a exportação para compartilhar ou guardar uma cópia.
- O Excel representa os vínculos registrados no BIPTAG. Ele não cadastra os animais automaticamente no Nedap e não é a planilha original `Tags.xlsx` de auditoria.

A migração local de versão 6 para 7 acrescenta as tabelas de cadastro e preserva as auditorias existentes. NFC e Bluetooth continuam dependentes dos formatos e recursos que o telefone e o bastão conseguem ler.

### Conferência com base importada

O técnico **não diagnostica o problema no curral**. Ele confirma fatos físicos:

1. Bipar a SmartTag.
2. Ver o animal cadastrado no Nedap.
3. Digitar o brinco observado.
4. Responder uma pergunta pronta.
5. O BIPTAG classifica e cruza as ocorrências automaticamente.

Exemplo:

- Tag cadastrada no animal 3630.
- Técnico vê brinco 3468.
- BIPTAG pergunta: **“O brinco deste animal é 3468?”**
- Opções: confirmar, corrigir número ou não confirmar.

Se depois ocorrer a leitura inversa (tag do 3468 encontrada no 3630), o sistema marca automaticamente o par como **possível troca de tags**.

## Persistência entre dias

A base importada, as auditorias e as leituras ficam no IndexedDB do navegador. É possível fechar o navegador, reiniciar o aparelho e retomar a auditoria depois.

A V0.3 possui:

- Pausar auditoria
- Retomar auditoria
- Finalizar auditoria
- Histórico de auditorias locais
- Data/hora da última atividade

> Importante: enquanto o backup no Supabase não estiver ativado, não limpe “dados do site” do BIPTAG no Chrome. Limpar o armazenamento do navegador remove o IndexedDB local.

## Atualizando da V0.1

A V0.3 usa o mesmo banco `biptag-db` e possui migrações Dexie compatíveis até a versão 7.

Para atualizar um projeto existente:

1. Pare `npm run dev`.
2. Faça uma cópia da pasta atual.
3. Substitua os arquivos do projeto pelos arquivos da V0.3.
4. No terminal execute:

```powershell
npm install
npm run dev
```

Ao abrir o navegador, o banco local existente é migrado automaticamente.

## Primeiro teste recomendado

1. Importe o `Tags.xlsx` original.
2. Use **Teste manual sem NFC**.
3. Simule uma tag válida.
4. Teste um brinco correto.
5. Teste um brinco diferente que exista na base.
6. Teste o par inverso para validar a detecção de possível troca.
7. Pause a auditoria, feche o navegador e abra novamente para validar retomada.

## Web NFC

O teste real deve ser feito no Chrome Android através de uma URL HTTPS, como a implantação no Vercel. O endereço HTTP local é suficiente para interface/Excel, mas não para validar Web NFC.

## Supabase

O arquivo `supabase/schema.sql` contém o modelo V0.3 preparado para:

- fazendas;
- auditorias;
- snapshot da base importada;
- leituras de campo;
- pares de possível troca;
- histórico de releituras;
- problemas da pré-validação.

A sincronização ainda deve ser habilitada depois de definir autenticação e política de usuários. O modo campo não depende de internet.
