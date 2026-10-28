(() => {
  const button = document.getElementById('update-button');
  const status = document.getElementById('status');
  const version = document.getElementById('version');
  let busy = false;

  function waitForActivation(worker) {
    if (!worker || worker.state === 'activated') return Promise.resolve();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => finish(new Error('O download demorou mais que o esperado. Confira a conexão e tente novamente.')), 60000);
      const changed = () => {
        if (worker.state === 'activated') finish();
        else if (worker.state === 'redundant') finish(new Error('A nova versão não terminou de baixar. Tente novamente.'));
      };
      function finish(error) {
        clearTimeout(timer); worker.removeEventListener('statechange', changed);
        if (error) reject(error); else resolve();
      }
      worker.addEventListener('statechange', changed); changed();
    });
  }

  button.addEventListener('click', async () => {
    if (busy) return;
    if (!navigator.onLine) { status.textContent = 'Sem internet. Conecte o celular para baixar a atualização e tente novamente.'; return; }
    busy = true; button.disabled = true; button.textContent = 'Atualizando…';
    status.textContent = 'Buscando a versão mais recente…';
    try {
      const response = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
      if (!response.ok) throw new Error('Não foi possível consultar a versão publicada. Tente novamente.');
      const published = await response.json();
      if (typeof published.build !== 'string') throw new Error('A resposta de atualização não é válida. Tente novamente.');
      version.textContent = `Versão publicada: ${new Date(published.build).toLocaleString('pt-BR')}`;
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.getRegistration('/');
        if (registration) {
          await registration.update();
          const next = registration.installing || registration.waiting;
          if (registration.waiting) registration.waiting.postMessage({ type: 'SKIP_WAITING' });
          if (next) { status.textContent = 'Baixando os arquivos do aplicativo…'; await waitForActivation(next); }
        }
      }
      // Fetch as a resource first, so a navigation fallback cannot substitute an old
      // cached document. The fresh entry URL is also excluded from that fallback.
      const destination = `/index.html?biptag-update=${Date.now()}`;
      const entry = await fetch(destination, { cache: 'no-store' });
      if (!entry.ok || !(await entry.text()).includes('type="module"')) throw new Error('Não foi possível carregar o aplicativo atualizado. Tente novamente.');
      try { localStorage.setItem('biptag-current-view', 'home'); } catch { /* The saved audit remains intact. */ }
      status.textContent = 'Atualização pronta. Abrindo o BIPTAG…';
      window.location.replace(destination);
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : 'Não foi possível atualizar agora. Tente novamente.';
      busy = false; button.disabled = false; button.textContent = 'Tentar novamente';
    }
  });
})();
