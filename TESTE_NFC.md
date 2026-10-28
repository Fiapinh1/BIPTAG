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
- [ ] Se a tag não trouxer dados NDEF ou retornar somente zeros, confirmar que o app não abre uma leitura e orientar o uso do bastão Bluetooth ou a digitação manual
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

## FER — conteúdo informado no TagInfo

O exemplo enviado usa um registro Text NDEF UTF-8, idioma `en`, número `984000009159339`, identificado pelo TagInfo como NFC Forum Type 2 / NTAG I²C Plus. A mensagem informada é:

```text
D1 01 12 54 02 65 6E 39 38 34 30 30 30 30 30 39 31 35 39 33 33 39
```

No Web NFC, `record.data` já contém o texto sem o cabeçalho NDEF, status e idioma. O app lê esse texto e não converte o UID físico em número de SmartTag. O teste automatizado usa o corpo exato de 15 bytes e confere o identificador completo, junto do modelo anterior `984000010317471`.

- [ ] No telefone, ativar NFC e aproximar a FER. Confirmar que chega o número completo e que o brinco pode ser registrado.
- [ ] Se não houver leitura, abrir `Dados recebidos pelo NFC → Copiar diagnóstico NFC` na espera de leitura ou nas Configurações. `started` sem `reading` indica que nenhum conteúdo foi entregue ao app; `readingerror` indica falha de leitura informada pelo navegador. Não afirmar compatibilidade física apenas porque o teste simulado passa.
- [ ] No bastão, comparar com a leitura NFC do app oficial HHR5000 da BioControl. Se ele transmitir `000000000000000`, manter a leitura descartada e investigar configuração/firmware do leitor. Não substituir zeros pelo número do exemplo nem por um identificador parecido da planilha.
- [ ] Se o bastão transmitir `984000009159339`, confirmar que a leitura entra pelo mesmo fluxo das tags anteriores, inclusive quando chegar em pacotes fragmentados.
- [ ] Alternar FER e uma tag anterior. As duas devem manter seus números completos e o resultado correto de conferência.

O diagnóstico Bluetooth recebido durante a investigação continha `+KEY=2` e, em outra notificação, 15 caracteres ASCII `0` seguidos de CR/LF. Isso comprova que naquela tentativa o número NDEF da FER não foi entregue ao app. A leitura física dessa unidade continua pendente até o leitor transmitir o identificador ou disponibilizar um comando documentado para obter o texto NDEF.

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
