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
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'BIPTAG',
        id: '/',
        short_name: 'BIPTAG',
        description: 'Auditoria de SmartTags com bastão Bluetooth, NFC ou digitação manual.',
        theme_color: '#231E1A',
        background_color: '#F4EFE7',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        lang: 'pt-BR',
        icons: [
          {
            src: '/icons/biptag-logo-192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/icons/biptag-logo-512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: '/icons/biptag-logo-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      },
      workbox: {
        cleanupOutdatedCaches: true,
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
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
