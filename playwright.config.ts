import { defineConfig } from '@playwright/test';
import { readFileSync } from 'node:fs';
const cfg = JSON.parse(readFileSync(new URL('./lens.config.json', import.meta.url), 'utf8'));
export default defineConfig({
  testMatch: ['verification/**/*.spec.ts', 'e2e/**/*.spec.ts'],
  snapshotPathTemplate: '{testDir}/__screenshots__/{testFilePath}/{arg}{ext}',
  use: { baseURL: cfg.baseUrl },
  expect: { toHaveScreenshot: { maxDiffPixelRatio: cfg.visual.screenshotDiffMaxPixelRatio } },
  webServer: {
    command: cfg.devServer,
    url: cfg.baseUrl,
    // Never reuse an unknown server: a stale or foreign process on the port
    // makes every gate "verify" the wrong code (deep-review finding M10 —
    // observed live: another project's dev server on 5173 failed all 72 e2e).
    reuseExistingServer: false,
  },
});
