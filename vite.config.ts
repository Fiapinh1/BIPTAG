import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const buildId = new Date().toISOString();

export default defineConfig({
  define: { 'import.meta.env.VITE_BIPTAG_BUILD': JSON.stringify(buildId) },
  plugins: [
    react(),
    { name: 'biptag-build-info', generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build: buildId }) });
    } },
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['images/farm-summary-hero.webp', 'images/home-farm-illustration.webp', 'images/registration-tag-illustration.webp', 'images/audit-directory-illustration.webp', 'images/audit-review-illustration.webp', 'novas logos/favicon.ico', 'novas logos/logo-32x32.png', 'novas logos/logo-180x180.png', 'novas logos/logo-192x192.png', 'novas logos/logo-512x512.png'],
      manifest: {
        name: 'BIPTAG',
        id: '/',
        short_name: 'BIPTAG',
        description: 'Cadastro e auditoria de SmartTags com bastão Bluetooth, NFC ou digitação manual.',
        theme_color: '#122022',
        background_color: '#F4F6F8',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        lang: 'pt-BR',
        icons: [
          {
            src: '/novas%20logos/logo-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/novas%20logos/logo-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      },
      workbox: {
        cleanupOutdatedCaches: true,
        globPatterns: ['**/*.{js,css,html,svg}'],
        globIgnores: ['**/atualizar.html', '**/update-app.js', '**/update-recovery-worker.js'],
        importScripts: ['/update-recovery-worker.js'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/atualizar\.html(?:\?|$)/, /^\/index\.html\?biptag-update=/],
        clientsClaim: true,
        skipWaiting: true
      }
    })
  ]
});
