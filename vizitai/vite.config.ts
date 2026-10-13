/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';
import pkg from './package.json' with { type: 'json' };

export default defineConfig({
  base: '/',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [
    preact(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      // globPatterns already precache every icon; the plugin would list the manifest icons (and the
      // manifest) a second time. It adds manifest.webmanifest itself, so the glob leaves it out.
      includeManifestIcons: false,
      manifest: {
        name: 'Vizitai', short_name: 'Vizitai', lang: 'lt',
        display: 'standalone', orientation: 'portrait',
        start_url: '/', scope: '/',
        theme_color: '#f2f2f7', background_color: '#f2f2f7',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: { globPatterns: ['**/*.{js,css,html,png,svg}'], navigateFallback: 'index.html' },
    }),
  ],
  build: { target: 'es2022' },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['tests/unit/setup.ts'],
  },
});
