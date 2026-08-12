/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Project-unique ports (vite's defaults 5173/4173 collide with other local
  // projects — a foreign server on the default port once failed all 72 e2e
  // against the wrong app). strictPort fails loudly instead of silently
  // auto-incrementing somewhere the gates aren't looking.
  server: {
    port: 5273,
    strictPort: true,
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
  preview: {
    port: 5274,
    strictPort: true,
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}', 'server/**/*.test.ts'],
    setupFiles: ['./src/test-setup.ts'],
    // Pin a DST-observing timezone for the whole suite: the dates/recurrence
    // DST regression tests are vacuous in non-DST zones (and the host machine
    // runs one). Individual files must NOT mutate process.env.TZ.
    env: {
      TZ: 'America/New_York',
    },
    environmentOptions: {
      jsdom: {
        url: 'http://localhost:5273/',
      },
    },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/test-setup.ts', 'src/main.tsx'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
})
