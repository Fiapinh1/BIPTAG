# BIPTAG Web — V0.2 Field Workflow

BIPTAG é uma PWA para auditoria de SmartTags Nedap em campo usando Web NFC, a planilha `Tags.xlsx` exportada do Nedap Now e confirmação visual do brinco.

## Stack

- React + TypeScript + Vite
- PWA / Service Worker
- Web NFC (`NDEFReader`)
- IndexedDB com Dexie
- SheetJS para importar/exportar Excel
- Supabase preparado para backup/sincronização
- GitHub + Vercel para deploy

## Regra central do modo campo

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

A V0.2 possui:

- Pausar auditoria
- Retomar auditoria
- Finalizar auditoria
- Histórico de auditorias locais
- Data/hora da última atividade

> Importante: enquanto o backup no Supabase não estiver ativado, não limpe “dados do site” do BIPTAG no Chrome. Limpar o armazenamento do navegador remove o IndexedDB local.

## Atualizando da V0.1

A V0.2 usa o mesmo banco `biptag-db` e possui migração Dexie da versão 1 para a versão 2.

Para atualizar um projeto existente:

1. Pare `npm run dev`.
2. Faça uma cópia da pasta atual.
3. Substitua os arquivos do projeto pelos arquivos da V0.2.
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

O arquivo `supabase/schema.sql` contém o modelo V0.2 preparado para:

- fazendas;
- auditorias;
- snapshot da base importada;
- leituras de campo;
- pares de possível troca;
- histórico de releituras;
- problemas da pré-validação.

A sincronização ainda deve ser habilitada depois de definir autenticação e política de usuários. O modo campo não depende de internet.
