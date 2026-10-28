export function ReaderHelp({ mode }: { mode: 'bluetooth' | 'phone' }) {
  const phone = mode === 'phone';
  return <details className="reader-help">
    <summary>{phone ? 'Ajuda com NFC e permissões' : 'Ajuda com Bluetooth e permissões'}</summary>
    <ol>
      <li>Abra o BIPTAG no Chrome atualizado para Android, pelo endereço HTTPS.</li>
      {phone ? <>
        <li>Ligue o NFC nas configurações do celular. Mantenha o app aberto e a tela desbloqueada.</li>
        <li>Toque em Ativar NFC e, se o navegador pedir, escolha Permitir. Se já bloqueou, abra as permissões do site no Chrome e permita NFC.</li>
        <li>Encoste uma tag NFC compatível no ponto da antena indicado pelo fabricante. Teste sem capa grossa ou magnética. No Galaxy Z Flip, confira a posição da antena nas configurações de NFC do aparelho.</li>
        <li>O celular lê conteúdo NFC NDEF. Para a identificação que exige o bastão, use Bluetooth.</li>
      </> : <>
        <li>Ligue o Bluetooth, deixe o bastão próximo e desconecte-o de outro celular antes de tentar.</li>
        <li>No Android: Configurações → Aplicativos → Chrome → Permissões → Dispositivos próximos, se essa opção aparecer.</li>
        <li>Toque em Conectar bastão e selecione o HHR5000 na lista. Se o Android solicitar Localização para procurar dispositivos, confira essa permissão também.</li>
        <li>Se o bastão já foi autorizado e não conecta, abra o ícone de Bluetooth e toque em Escolher outro bastão para selecionar novamente.</li>
        <li>Se chegar somente zeros, a conexão recebeu dados, mas não um número válido de tag. Reconecte, teste a mesma tag e confira se o bastão está livre de outros apps. Em Dados recebidos do bastão, copie o diagnóstico se persistir.</li>
        <li>Para uma tag com número gravado em texto NFC, como a FER do teste, o bastão precisa transmitir esse conteúdo. Compare a leitura no modo NFC do app oficial HHR5000 da BioControl; um apito sozinho não confirma que o número foi enviado.</li>
      </>}
    </ol>
  </details>;
}
