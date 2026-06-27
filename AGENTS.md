# AGENTS.md — VeryDirtyRSS

## Build / Test / Lint

```bash
# Install dependencies
npm install

# Build (TypeScript → dist/)
npm run build          # tsc

# Run all unit tests
npm test               # vitest run

# Run tests in watch mode
npm run test:watch     # vitest

# Run a single unit test file
npx vitest run tests/rss.test.ts

# Run the live feed integration tests (validates selectors against real sites)
npx vitest run tests/feeds.test.ts --pool=forks

# Run tests matching a pattern
npx vitest run -t "crawls previous pages"

# Development server (NODE_ENV=development, debug logging with pretty-print)
npm run dev

# Start production build
npm start              # node dist/index.js
```

**No dedicated linter or formatter is configured.** The TypeScript compiler (`tsc`) is the only static check. Strict mode is on — `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch` are all enabled, so `tsc` catches dead code and unused variables.

## Architecture

```
src/
├── index.ts      Express app entry. Defines GET /rss, /health, /.
│                 Creates FileCache, wires fetchHtmlWithCache(),
│                 calls generateRssXml(). Exports `app` + `createFetchHtmlWithCache`.
├── rss.ts        Core RSS generation. Parses HTML with cheerio, extracts
│                 items via CSS selectors, builds RSS XML via the `rss` package.
│                 Handles multi-page crawling (previous selector),
│                 full-content fetching, metadata extraction.
├── cache.ts      FileCache class. Disk-based key/value store with TTL.
│                 SHA-256 hashed keys as filenames in os.tmpdir().
│                 Atomic writes via temp-file + rename.
├── fetch.ts      HTTP client with retry (exponential backoff, 1s/2s + jitter,
│                 up to 3 attempts, only retries 5xx/network errors).
│                 Wrapped in concurrency limiter.
├── limiter.ts    Promise-based semaphore capping concurrent outbound HTTP
│                 requests (default 10, configurable via MAX_CONCURRENCY).
└── logger.ts     Pino logger — debug level with pretty-print in dev,
                  info level with JSON output in production.
```

### Data flow

1. **GET /rss?url=...&item=...&title=...** → Express handler
2. `createFetchHtmlWithCache(cache)` returns a fetch function that checks cache before HTTP GET (axios with retry + concurrency limit)
3. `generateRssXml()` loads HTML via cheerio, extracts items using CSS selectors, iterates pages via `previousSelector`
4. For each matched item: extracts title, description, link, date, author, image URL
5. If `fetchContent=true` and content selector is set, fetches each article's full HTML (with retry and concurrency limit)
6. Returns RSS XML (`application/rss+xml`)
7. Cache stores raw HTML per URL with TTL

### Pagination

When `previousSelector` is set, `generateRssXml` loops: fetches current page, extracts items, finds the "previous" link, fetches that page, repeats until the selector produces no match or the URL has already been visited (cycle protection via `visitedPageUrls` Set).

## Key Files & Directories

| Path | Purpose |
|------|---------|
| `src/` | Application source (6 files) |
| `tests/` | Vitest test suite (5 files, mirrors src/) |
| `dist/` | Compiled JS output (gitignored) |
| `Dockerfile` | Multi-stage build: builder + production on `node:20-alpine` |
| `docker-compose.yml` | Tailscale + app container, shares network |
| `tsconfig.json` | Base TS config: ES2020 target, NodeNext modules, strict |
| `tsconfig.server.json` | Extends base, used for build output; excludes test files |
| `tsconfig.node.json` | For config files (`vitest.config.*`) |
| `package.json` | ESM (`type: "module"`), scripts, dependencies |

### Important config details

- **ESM imports require `.js` extensions** even in source `.ts` files (e.g. `'./cache.js'`). This is mandated by `"module": "NodeNext"`.
- **No separate linter** — `tsc --noEmit` or `npm run build` is the static analysis pass.
- **Cache directory**: `$TMPDIR/verydirtyrss-cache/` by default. Override via `cacheDir` option (hardcoded; not exposed via env).
- **Environment variables**: `PORT` (default 3000), `CACHE_TTL_SECONDS` (default 900), `CACHE_ENABLED` (default `true`), `USER_AGENT` (default Chrome 120), `MAX_CONCURRENCY` (default 10), `CONTENT_TIMEOUT_MS` (default 5000), `LOG_LEVEL` (debug in dev, info in production).

## Coding Conventions

- **Module system**: ESM (`"type": "module"`). All imports use `.js` extension in specifiers (e.g. `'./cache.js'`).
- **Exports**: Named exports (`export function`, `export class`, `export type`). `app` is exported as named from `index.ts`.
- **Error handling**: `try/catch` in Express handler → `res.status(500).json({ error, message })`. Console logging for diagnostics.
- **Async**: `async/await` throughout. No callbacks or raw promises.
- **Date parsing**: Parses both `datetime` attribute and text content via `new Date()`. Returns `null` if invalid.
- **URL resolution**: Relative URLs resolved via `new URL(href, base)`.
- **Testing**: Vitest with `vi.fn()` for mocks, `vi.spyOn()` for console spies, `vi.mocked(axios)` typed mocking. `supertest` for HTTP endpoint tests.
- **No default exports** except implicitly through the `rss` package instantiation inside `generateRssXml`.

## Git Workflow

- **Branch**: `main` (no observed feature branches in recent history).
- **Commits**: Mix of merges and direct commits. Use conventional descriptive messages.
- **No observed convention for branch naming or commit prefixes.**

## CI/CD

- **No CI configuration found** (no `.github/workflows/`, no CI badges besides Docker badge in README).
- **Docker workflows**: Manual via `docker build` / `docker-compose up`.
- **Docker image published as**: `ciberado/verydirtyrss:1.1.0` (referenced in docker-compose.yml).

## Tips for AI Agents

1. **ESM + .js extensions trip auto-imports.** When adding imports from project files, always use `./foo.js` not `./foo` — TypeScript's NodeNext module resolution requires it.
2. **No nodemon config file.** The `dev` script uses inline nodemon args. To change watch behavior, edit the script in `package.json`.
3. **Cache is file-based, not in-memory.** Tests create temp directories and clean them in `afterEach`. When adding cache features, remember cleanup.
4. **Vitest v4 is installed — not v1/v2.** Some APIs may differ (e.g., `vi.hoisted()` may be available). Check Vitest 4 docs if something behaves unexpectedly.
5. **Mock axios carefully.** Tests mock `axios.get` at the module level via `vi.mock('axios')`. New tests that hit `/rss` must set up `mockedAxios.get.mockResolvedValue(...)` with the expected HTML.
6. **The `rss` npm package is used for XML generation** — not a manual XML builder. Feed items are added via `feed.item({...})` and serialized via `feed.xml({ indent: true })`.
7. **No Prisma, no database, no queue.** This is a stateless HTTP-to-RSS proxy. State is only the disk cache.
8. **No `package-lock.json` in .gitignore** — it's committed. Run `npm ci` in CI/Docker for reproducible builds.
9. **Builder UI** at `GET /` — serves an interactive HTML form to browsers, JSON docs to API clients. The form builds RSS URLs with all parameters.
10. **Full content** requires `fetchContent=true` plus either a `content` CSS selector or `readability=true`. Readability uses `@mozilla/readability` to strip navigation/ads and returns clean article HTML.
11. **Pino logger** is used instead of `console.log`. In tests, spy on `logger` methods (`logger.warn`, `logger.error`) rather than `console`.
12. **`fetchWithRetry`** is the single HTTP path — tests should mock `../src/fetch.js` instead of mocking `axios` directly.
13. **Feeds integration test** at `tests/feeds.test.ts` validates selectors against live sites. Run with `--pool=forks` to avoid race conditions.
