# Teste NFC — checklist rápido

Use este checklist depois que o BIPTAG estiver publicado no Vercel.

- [ ] Abrir a URL HTTPS no Chrome Android
- [ ] NFC do aparelho ligado
- [ ] Abrir uma auditoria com Tags.xlsx importado
- [ ] Tocar em `Ativar leitor NFC`
- [ ] Aceitar permissão do navegador
- [ ] Aproximar a SmartTag
- [ ] Confirmar que o BIPTAG mostra o número NDEF
- [ ] Confirmar que o UID físico não é utilizado
- [ ] Ler uma tag existente na planilha
- [ ] Confirmar que aparece o animal esperado
- [ ] Digitar o brinco correto e salvar
- [ ] Ler outra tag e testar divergência
- [ ] Desligar internet e confirmar que a auditoria continua acessível

## Tag usada no primeiro teste técnico

Exemplo de conteúdo NDEF validado anteriormente:

```text
984000010317471
```

Observação: se essa tag não estiver na planilha importada, o resultado esperado é `Tag não cadastrada na base importada`.

## Teste de possível troca

1. Simular `984000009156334` (Nedap 3058) e informar brinco `3630`.
2. Confirmar que está fisicamente no animal 3630.
3. Simular `984000009156171` (Nedap 3630) e informar brinco `3058`.
4. Confirmar que está fisicamente no animal 3058.
5. Resultado esperado: **Possível troca identificada**.

## Teste de retomada

1. Pausar uma auditoria.
2. Fechar o navegador.
3. Abrir novamente o BIPTAG.
4. Confirmar que a auditoria aparece como pausada e pode ser retomada.
