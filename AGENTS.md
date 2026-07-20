# Nookbag

Lab UI shell for Red Hat Demo Platform (RHDP). Renders documentation in a left pane (Antora-generated HTML) and embedded service tabs (terminals, consoles, code-server) in a right pane. Supports two modes: `showroom` (documentation-only) and `zerotouch` (guided lab with progress tracking, validation scripts, and solve automation).

## Tech Stack

- **Language**: TypeScript (no tsconfig — types are checked by IDE/editor only, not enforced at build)
- **Framework**: React 18, Vite 7
- **UI library**: PatternFly 6 (`@patternfly/react-core`, `react-icons`, `react-styles`)
- **Data fetching**: `unfetch` (fetch polyfill) + `swr` (`useSWRImmutable` for cached/deduplicated requests)
- **Layout**: `react-split` for resizable panes
- **Testing**: Vitest + React Testing Library + jsdom
- **Container**: UBI 10 (Node 22 builder → httpd-24 runtime)
- **Config format**: YAML (`js-yaml`), loaded at runtime from `ui-config.yml`

## Commands

```bash
npm ci                # install dependencies (use ci, not install)
npm run dev           # dev server on http://localhost:8080/nookbag/ (hot reload)
npm run build         # production build → dist/
npm run test:run      # run tests once
npm run test          # watch mode
npm run test:coverage # coverage report
npm run pack          # build + zip with timestamp
```

## Project Structure

```
src/
  index.html          # Vite HTML entry point
  index.tsx           # entry point (React root + ErrorBoundary)
  app.tsx             # main component — config loading, tab/module rendering, navigation
  types.ts            # shared types (TTab, TModule, TProgress, Step, ModuleSteps)
  utils.ts            # API helpers (runner API), YAML error formatting, postMessage comms
  progress-header.tsx # module progress bar + remaining time
  progress-bar.tsx    # progress bar segments
  remaining-time.tsx  # countdown timer
  view-switcher.tsx   # draggable view-mode popout (instructions/split/tabs)
  loading.tsx         # loading overlay
  *.css               # component styles (plain CSS, no modules)
  test-setup.ts       # vitest setup (jsdom globals)
  utils.test.ts       # unit tests for utils
  app.test.tsx        # component tests for app
  test-configs/       # sample YAML configs for tests
vite.config.ts        # build config (base path, Traefik HMR wiring, port)
vitest.config.ts      # test config (jsdom environment, coverage, timeouts)
docs/
  UI-CONFIG.md        # full reference for ui-config.yml options
healthz/              # Python sidecar for health/readiness endpoints
scripts/pack.sh       # build + zip script
Dockerfile            # production multi-stage (Node build → httpd serve)
Dockerfile.dev        # dev image with hot reload
```

## Architecture

- The app is a single-page React app served as static files behind httpd (or Traefik in dev).
- Config is loaded once at startup from `./ui-config.yml` (falls back to `./zero-touch-config.yml`).
- Lab content (Antora HTML) is mounted at runtime — it is NOT part of this repo. The serve directory defaults to `www` in showroom mode and `antora` in zerotouch mode, configurable via `antora.dir` in `ui-config.yml`.
- The runner API (`/runner/api/`) is a separate sidecar service — this repo only contains the frontend client code in `utils.ts`.
- Parent-frame communication uses `postMessage` for `DELETE`, `RESTART`, `COMPLETED` events.

## Conventions

- Use PatternFly 6 components; do not introduce other UI frameworks or CSS libraries.
- No `any` casts unless unavoidable (existing casts are tech debt, do not add more).
- Use `unfetch` for one-shot HTTP calls (runner API); use `swr` (`useSWRImmutable`) for cached/deduplicated data fetching.
- `TTab` and `TModule` in `types.ts` type the `tabs[]` and `antora.modules[]` arrays; the top-level config shape is currently untyped (`as any` — tech debt). Keep `TTab`/`TModule` as the source of truth for their respective sections.
- Tab URL construction logic lives in `createUrlsFromVars()` in `app.tsx` — changes there affect all tab types.
- CSS is plain `.css` files co-located with components. No CSS modules, no Tailwind, no styled-components.
- Formatting: `.prettierrc` enforces `singleQuote: true`, `printWidth: 120`. No format script — editor-integration only.

## Boundaries

- Do not modify files under `dist/` — they are build output.
- Do not modify files under `healthz/` without explicit request — it is a separate Python service.
- Do not add new npm dependencies without discussing the need first.
- The `docs/UI-CONFIG.md` is the user-facing config reference — keep it in sync with any config schema changes.
- Before considering a change done, run `npm run test:run && npm run build` and fix any failures.
- CI runs on push/PR to `main` and `develop` — it runs tests and build. PRs will not merge if CI fails.
