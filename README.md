# todo-quantum

A keyboard-first todo app in the "Ink Garden" visual direction — cool washi white, sumi-ink
type, aizome indigo for everything you touch, hanko crimson for the marks that matter. Tasks
are captured through a single command bar with natural-language dates, priorities, and
recurrence, and organised across Today / Upcoming / All / Done views.

It is a fully client-side single-page app: React 19 + Vite, with all state persisted to
`localStorage`. There is no backend, no database, and no environment variables.

## Local development

```bash
pnpm install
pnpm dev            # http://localhost:5273
```

## Verification

While working, `pnpm build` is the typecheck gate (`tsc -b` plus the production bundle),
`pnpm lint` runs ESLint, and `pnpm test` runs the unit suite. For UI work,
`bash verification/run-visual-gate.sh <route>` runs visual regression, axe, and Lighthouse.

`lens.config.json` is the authoritative gate list — coverage thresholds, e2e, and the
individual visual gates are defined there, and CI-equivalent runs should use those commands
rather than the shorthands above.

## Deployment (Railway)

The app ships as a two-stage container: Node builds the static bundle, Caddy serves it.

- `Dockerfile` — builds with `pnpm build`, copies `dist/` into a `caddy:2-alpine` image.
- `Caddyfile` — binds to Railway's `$PORT`, gzip/zstd compression, SPA fallback to
  `index.html`, `no-cache` by default with immutable caching for content-hashed `/assets/*`,
  and security headers.
- `railway.json` — pins the Dockerfile builder and healthchecks `/`, which fails if the built
  bundle is missing (a static `/healthz` literal would not).

### First deploy

```bash
railway login
railway init            # or: railway link, to attach to an existing project
railway up              # builds and deploys from the Dockerfile
railway domain          # generate a public *.up.railway.app domain
```

Subsequent pushes to the connected branch deploy automatically once the GitHub repo is
linked in the Railway dashboard.

### Verifying the image locally

```bash
docker build -t todo-quantum .
docker run --rm -p 8080:8080 todo-quantum
# then open http://localhost:8080
```

## Project conventions

See `CLAUDE.md` for the agent guide and `DESIGN-SYSTEM.md` for the visual contract. Every
visual decision derives from the design system's tokens, which live in `src/styles/tokens.css`.
