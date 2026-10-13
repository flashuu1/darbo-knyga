/// <reference types="vitest/config" />
import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';
import pkg from './package.json' with { type: 'json' };
import site from './site.config.json' with { type: 'json' };

// Single source of truth for the production URL path (also read by scripts/scan-bundle.mjs).
// VIZITAI_BASE overrides it for experiments. Only production mode gets the sub-path: `vite dev`
// and the e2e build (--mode e2e) stay at '/', so tests and dev servers are unchanged.
/** Short commit hash of this build: GitHub Actions provides GITHUB_SHA; locally ask git; else 'dev'. */
function buildId(): string {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7);
  try {
    return execSync('git rev-parse --short=7 HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || 'dev';
  } catch {
    return 'dev';
  }
}

export default defineConfig(({ mode }) => {
  const base = mode === 'production' ? (process.env.VIZITAI_BASE || site.basePath) : '/';
  return {
  base,
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    // Shown in Settings so she can tell whether an update has arrived.
    __BUILD_ID__: JSON.stringify(buildId()),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
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
        start_url: base, scope: base,
        theme_color: '#f9f9f9', background_color: '#f9f9f9', // = --chrome (light)
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
};
});
