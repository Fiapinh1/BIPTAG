const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

// Presentation only: API availability never proves whether the phone's radio is on.
export function nfcFeedback(error: string | null | undefined, active: boolean): { title: string; message: string } | null {
  if (!error) return null;
  const text = normalize(error);
  if (text.includes('bloqueado')) return { title: 'Permissão necessária', message: 'Autorize o NFC nas permissões do site.' };
  if (text.includes('https')) return { title: 'Acesso seguro necessário', message: 'Abra o BIPTAG pelo endereço HTTPS.' };
  if (text.includes('nao disponibilizou um leitor nfc') || text.includes('nao esta disponivel neste navegador')) return { title: 'NFC indisponível', message: 'Confira o aparelho e o navegador na ajuda.' };
  if (text.includes('somente zeros')) return { title: 'Tag inválida', message: 'Nenhuma tag registrada. Tente novamente.' };
  if (text.includes('mais de um numero')) return { title: 'Mais de um número na tag', message: 'Nada registrado. Confira os dados na ajuda.' };
  return active
    ? { title: 'Leitura não reconhecida', message: 'Aproxime a tag novamente.' }
    : { title: 'Não foi possível ativar', message: 'Confira o NFC e tente novamente.' };
}

export function nfcTechnicalMessage(error?: string | null): string {
  // Retain the NFC explanation while omitting recommendations for other readers.
  return (error ?? '').replace(/;\s*(?:use o|confira a etiqueta e tente o) bastão Bluetooth HHR5000SN ou digite o número\./gi, '.');
}
