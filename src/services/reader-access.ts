export function isReaderSecureContext() {
  return typeof window === 'undefined' || window.isSecureContext !== false;
}

export function describeReaderError(error: unknown, mode: 'bluetooth' | 'nfc', deviceSelected = false): { message: string; retryable: boolean } {
  const name = error && typeof error === 'object' && 'name' in error ? String(error.name) : '';
  const detail = error instanceof Error ? error.message : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return { retryable: false, message: mode === 'nfc'
      ? 'O acesso ao NFC foi bloqueado. No Chrome, abra as permissões deste site e permita NFC. Confira também se o NFC do celular está ligado e tente ativar novamente.'
      : 'O acesso ao Bluetooth foi bloqueado. No Android, abra Configurações → Aplicativos → Chrome → Permissões e permita Dispositivos próximos, se essa opção aparecer. No Chrome, confira também as permissões deste site e tente conectar novamente.' };
  }
  if (name === 'NotSupportedError' || (mode === 'nfc' && name === 'NotFoundError')) {
    return { retryable: false, message: mode === 'nfc'
      ? 'O celular não disponibilizou um leitor NFC. Abra no Chrome atualizado para Android, ligue o NFC nas configurações do aparelho e tente novamente. Ter NFC para pagamentos não garante a leitura desta tag pelo navegador.'
      : 'Este celular ou navegador não disponibilizou Bluetooth para o BIPTAG. Tente no Chrome atualizado para Android com o Bluetooth ligado.' };
  }
  if (mode === 'bluetooth' && name === 'NotFoundError') {
    return { retryable: false, message: deviceSelected
      ? 'O bastão não disponibilizou o serviço de leitura esperado. Confira se está em modo Bluetooth e use Escolher outro bastão para autorizar o HHR5000 novamente.'
      : 'Nenhum bastão selecionado. Ligue o Bluetooth, deixe o HHR5000 próximo e selecione-o na lista. Se a lista ficar vazia, confira a permissão de Dispositivos próximos do Chrome; em aparelhos que solicitarem, confira também a Localização.' };
  }
  if (mode === 'nfc' && (name === 'NotReadableError' || name === 'InvalidStateError')) {
    return { retryable: false, message: 'Não foi possível iniciar o NFC. Desligue e ligue o NFC nas configurações do celular, mantenha a tela desbloqueada, feche outros leitores de tags e tente ativar novamente.' };
  }
  if (mode === 'bluetooth' && name === 'NetworkError') {
    return { retryable: true, message: 'Não foi possível manter a conexão com o bastão. Confira se ele está ligado, próximo e livre de outra conexão. O app tentará reconectar.' };
  }
  return { retryable: mode === 'bluetooth', message: detail || (mode === 'nfc' ? 'Não foi possível ativar o NFC. Confira as permissões e tente novamente.' : 'Não foi possível conectar ao bastão. Confira as permissões e tente novamente.') };
}
