import { defineConfig } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const cfg = JSON.parse(readFileSync(new URL('./lens.config.json', import.meta.url), 'utf8'));

// The app syncs through the API sidecar on every mount; with nothing listening,
// every run would render the offline banner and bless it into the baselines.
// The suite therefore starts a real server on a throwaway database, so each run
// begins with no stored lists at all.
const API_PORT = 3000;
const E2E_DB_PATH = join(tmpdir(), `todo-quantum-e2e-${randomUUID()}.db`);
export default defineConfig({
  testMatch: ['verification/**/*.spec.ts', 'e2e/**/*.spec.ts'],
  snapshotPathTemplate: '{testDir}/__screenshots__/{testFilePath}/{arg}{ext}',
  use: { baseURL: cfg.baseUrl },
  expect: { toHaveScreenshot: { maxDiffPixelRatio: cfg.visual.screenshotDiffMaxPixelRatio } },
  webServer: [
    {
      command: 'pnpm run server:dev',
      port: API_PORT,
      env: { DB_PATH: E2E_DB_PATH },
      reuseExistingServer: false,
    },
    {
      command: cfg.devServer,
      url: cfg.baseUrl,
      // Never reuse an unknown server: a stale or foreign process on the port
      // makes every gate "verify" the wrong code (deep-review finding M10 —
      // observed live: another project's dev server on 5173 failed all 72 e2e).
      reuseExistingServer: false,
    },
  ],
});
