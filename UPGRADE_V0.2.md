# Como instalar a V0.2 no projeto atual

## Opção mais segura

1. No VS Code, pare o servidor com `Ctrl + C`.
2. Feche o VS Code.
3. Renomeie sua pasta atual para `BIPTAG-Web-backup`.
4. Extraia a pasta `BIPTAG-Web-V0.2` e renomeie para `BIPTAG-Web`.
5. Abra a nova pasta no VS Code.
6. Execute:

```powershell
npm install
npm run dev
```

## Sobre os dados que você já testou

O IndexedDB pertence ao endereço/origem do site, e não à pasta do código. Se continuar usando o mesmo `localhost:5173` / mesmo domínio Vercel, a migração Dexie V1 → V2 preserva o banco local existente.

Mesmo assim, esta é uma versão de desenvolvimento. Antes de usar em uma auditoria real, valide a retomada e faça o deploy no Vercel.

## Teste rápido da nova lógica

### Correto
- Tag: `984000009156334`
- Nedap: `3058`
- Brinco digitado: `3058`
- Esperado: conferência correta e retorno automático.

### Divergência guiada
- Tag: `984000009156334`
- Nedap: `3058`
- Brinco digitado: `3630`
- Confirme: “Sim, estou no animal 3630”.

### Possível troca automática
Depois do teste anterior:
- Tag: `984000009156171`
- Nedap: `3630`
- Brinco digitado: `3058`
- Confirme a leitura física.
- Esperado: BIPTAG mostra **Possível troca identificada** e relaciona as duas tags.

### Retomar outro dia
1. Clique em **Pausar**.
2. Feche a aba do navegador.
3. Abra novamente.
4. A auditoria deve aparecer como **Pausada** com botão **Retomar auditoria**.
