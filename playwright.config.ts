import { defineConfig } from '@playwright/test';
import { readFileSync } from 'node:fs';
const cfg = JSON.parse(readFileSync(new URL('./lens.config.json', import.meta.url), 'utf8'));
export default defineConfig({
  testMatch: ['verification/**/*.spec.ts', 'e2e/**/*.spec.ts'],
  snapshotPathTemplate: '{testDir}/__screenshots__/{testFilePath}/{arg}{ext}',
  use: { baseURL: cfg.baseUrl },
  expect: { toHaveScreenshot: { maxDiffPixelRatio: cfg.visual.screenshotDiffMaxPixelRatio } },
});
