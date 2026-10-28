// Recover only a page the user explicitly opened to update the application.
// An old cached app may have intercepted this URL before this worker installed.
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim().then(() => self.clients.matchAll({ type: 'window', includeUncontrolled: true })).then((clients) => {
    for (const client of clients) {
      const url = new URL(client.url);
      if (url.origin === self.location.origin && url.pathname === '/atualizar.html') {
        // Do not await navigation inside activation: its fetch may need activation
        // to finish. Normal audit/settings pages are never navigated here.
        void client.navigate(url.href).catch(() => {});
      }
    }
  }));
});
