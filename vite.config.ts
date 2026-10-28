import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  define: { 'import.meta.env.VITE_BIPTAG_BUILD': JSON.stringify(new Date().toISOString()) },
  plugins: [
    react(),
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
        navigateFallback: '/index.html',
        clientsClaim: true,
        skipWaiting: true
      }
    })
  ]
});
