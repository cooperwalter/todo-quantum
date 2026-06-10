/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test-setup.ts'],
    // Pin a DST-observing timezone for the whole suite: the dates/recurrence
    // DST regression tests are vacuous in non-DST zones (and the host machine
    // runs one). Individual files must NOT mutate process.env.TZ.
    env: {
      TZ: 'America/New_York',
    },
    environmentOptions: {
      jsdom: {
        url: 'http://localhost:5173/',
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
