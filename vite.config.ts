import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'BIPTAG',
        short_name: 'BIPTAG',
        description: 'Auditoria de SmartTags via NFC',
        theme_color: '#12201B',
        background_color: '#EEF3EE',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
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
        navigateFallback: '/index.html',
        clientsClaim: true,
        skipWaiting: true
      }
    })
  ]
});
