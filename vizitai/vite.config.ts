/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import pkg from './package.json' with { type: 'json' };

export default defineConfig({
  base: '/',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [preact()],
  build: { target: 'es2022' },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['tests/unit/setup.ts'],
  },
});
