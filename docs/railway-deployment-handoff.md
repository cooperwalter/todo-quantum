# Handoff — Railway deployment readiness

**Date:** 2026-08-11
**Branch:** `main` (base commit `9aa764a`)
**Status:** Deployment config written, reviewed, and verified end-to-end. **Nothing is committed.**

---

## 1. What the project is

A purely client-side React 19 + Vite SPA. State lives in `localStorage`. There is **no backend,
no database, and no environment variables**. There is also no client-side router — the app is a
single page with tab state (`src/App.tsx` switches on `view`).

That shape drove the deployment approach: build a static bundle, serve it from a tiny container.

## 2. What is in the changeset

Two-stage container — Node builds, Caddy serves.

| File | Status | Purpose |
| --- | --- | --- |
| `Dockerfile` | new | `node:26-alpine` build stage → `caddy:2-alpine` runtime |
| `Caddyfile` | new | `$PORT` binding, compression, SPA fallback, caching, security headers |
| `.dockerignore` | new | Allowlist — everything excluded unless explicitly re-included |
| `railway.json` | new | Pins the Dockerfile builder, healthchecks `/`, 60s healthcheck timeout |
| `README.md` | rewritten | Replaced Vite boilerplate with real project + deploy docs |
| `package.json` | modified | Added `packageManager: pnpm@10.9.0` |
| `package-lock.json` | **deleted** | Both lockfiles were committed; pnpm is the real manager |

### Key design points

- **pnpm version lives in one place.** The Dockerfile installs a pinned `corepack@0.35.0` above
  the manifest `COPY` (so the layer stays cached), then `corepack install` with no arguments
  resolves pnpm from `package.json`'s `packageManager`.
- **Cache rules key on the served file, not the request path.** `/assets/*` gets a year-long
  immutable TTL only when the file actually exists; everything else — including the shell served
  for any unmatched deep link, and a rollover 404 — gets `no-cache`.
- **Assets never fall back to the shell.** A missing `/assets/` file 404s rather than serving
  `index.html` under the immutable header.
- **`-Server` is deliberately outside the main `header` block.** A delete op defers the whole
  block, and deferred ops are skipped on Caddy's error path — which would strip the security
  headers from every 404.

## 3. Verification evidence (fresh, 2026-08-11)

Project gates:

- `pnpm install --frozen-lockfile` — lockfile in sync with `package.json`.
- `pnpm build` — passes. 236.98 kB JS / 73.87 kB gzip, 18.22 kB CSS.
- `pnpm lint` — clean.
- `pnpm test` — 3509 tests across 24 files, all passing.

Container (`docker build --no-cache`, run locally):

| Request | Status | `Cache-Control` |
| --- | --- | --- |
| `/` | 200 | `no-cache` |
| `/index.html` | 200 | `no-cache` |
| `/some/deep/route` | 200 | `no-cache` (SPA shell) |
| `/assets/index-*.js` | 200 | `public, max-age=31536000, immutable` (+ gzip) |
| `/assets/index-*.css` | 200 | `public, max-age=31536000, immutable` |
| `/assets/nope.js` | 404 | `no-cache` |
| `/favicon.svg` | 200 | `no-cache` |

- All four security headers (CSP, `X-Content-Type-Options`, `Referrer-Policy`,
  `Permissions-Policy`) present on **both** 200 and 404 responses.
- `Server` stripped on success responses.
- Port fallback works: `docker run -p 8080:8080` with no `PORT` set serves 200.
- Playwright against the container: app renders correctly, **zero console errors or warnings**.

Test containers and images were removed after verification.

## 4. Review status

`/simplify` (4 agents: reuse, simplification, efficiency, altitude) and `/code-review medium`
both ran to completion. **All actionable findings were applied.** `/code-review` found no
correctness bug that breaks the deploy, and independently confirmed that the absent
`corepack enable` is not a defect (the npm `corepack` package ships the pnpm shim itself).

Two findings were verified by experiment rather than accepted on assertion — both agent
proposals were wrong as written:

- A "blanket `no-cache` with `/assets/*` as the exception" **silently does not work**. In Caddy
  an earlier `header` directive wraps outermost and applies last, so the blanket rule overwrites
  the asset rule and assets ship `no-cache`.
- Consolidating the cache headers into the `handle` blocks drops `Cache-Control` entirely on a
  missing asset. The committed form adds a `@missing not file` guard, which preserves the
  behavior while still reducing the `/assets/*` literal to a single occurrence.

## 5. Outstanding — deliberately deferred

### Finding A — CSP `'unsafe-inline'` is at the wrong layer

`Caddyfile` weakens `script-src` to `'self' 'unsafe-inline'` app-wide. The only reason is one
inline `onload="this.media='all'"` attribute in `index.html`, used to load Google Fonts
asynchronously. Vite's own output is a fully external module script, so `'unsafe-inline'` exists
100% for the font trick — and it authorizes every inline script the app will ever contain.

**Recommended fix: self-host the fonts** (`@fontsource/*` for Shippori Mincho, Zen Kaku Gothic
New, M PLUS 1 Code — declared in `src/styles/tokens.css`). There are **zero** inline `style=`
attributes in `src/`, so this lets both `script-src` and `style-src` drop `'unsafe-inline'` and
removes `fonts.googleapis.com` / `fonts.gstatic.com` entirely — collapsing the CSP to a clean
`default-src 'self'`. Roughly 30 minutes plus a baseline refresh.

**Pixel Law note:** low-risk. `e2e/fixtures.ts` defines `waitForFonts` as `document.fonts.ready`
and wraps every `page.goto` in it; `verification/visual.spec.ts` calls it explicitly and uses
`waitUntil: 'networkidle'`. Baselines are captured *after* fonts settle, so a font-loading change
moves timing, not final pixels. Regenerate baselines once and look at them anyway.

**Do not** use `'unsafe-hashes' 'sha256-...'` — nearly as weak, and the hash must be recomputed on
every attribute edit.

### Gate gap — nothing exercises the Caddyfile

The visual and a11y gates run against `baseUrl: http://localhost:5273` (the Vite dev server), and
`lighthouserc.json` uses `vite preview` — so **no gate ever exercises Caddy**. The CSP, the four
security headers, the two-tier cache rules, and the SPA deep-link fallback are all unverified
assertions in CI; a CSP typo or a cache-rule inversion ships green.

Right-altitude fix: a small container smoke gate — `docker build`, `docker run -e PORT`, then
assert the request matrix in §3 with `curl -I`. That tests the artifact that actually ships. Worth
closing regardless of which CSP fix is chosen.

### Known minor residuals

- `Server: Caddy` still leaks on **error** responses only. Stripping it there requires a
  `handle_errors` block that rewrites every error body — not worth it for a banner.
- `/assets/*` is Vite's default `assetsDir` but is not pinned in `vite.config.ts`. Someone setting
  `base` or `build.assetsDir` would silently convert every hashed asset to `no-cache` with no
  build error and no gate to catch it. One line in `vite.config.ts` would close it.
- `@types/node` is `^24` while the build image is `node:26-alpine`.

## 6. Pre-existing issues (not from this work)

- `lens.config.json` sets `gates.integration` to `pnpm run test:integration`, but no such script
  exists in `package.json`. The README correctly omits it.
- `package.json` has a `"typecheck": "tsc --noEmit"` script, but `lens.config.json` defines the
  typecheck gate as `pnpm run build`. The script is a decoy.

## 7. Next steps

1. **Commit.** Work is on `main`, so per the project's git rules this needs explicit approval —
   nothing has been committed.
2. Deploy:
   ```bash
   railway login
   railway init          # or: railway link
   railway up
   railway domain
   ```
3. Optionally take Finding A and the container smoke gate.

### Optional polish, deliberately not done

`index.html` still has `<title>todo-quantum</title>` with no meta description and no
`theme-color`. There is no `robots.txt`.

## 8. Environment note

Docker Desktop would not start from an agent session (`open -a Docker` reported success with no
surviving process — likely a GUI permission or login dialog). Start Docker manually before any
container verification in a future session.
