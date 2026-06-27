# Changelog

## [1.6.0] - 2026-06-27

### Added
- **Pino structured logging** — replaces raw console.log with level-controlled, JSON-output logger; debug with pretty-print in dev, info with JSON in production
- **Configurable User-Agent** — `USER_AGENT` env var; defaults to Chrome 120 UA which most sites do not block
- **HTTP retry with exponential backoff** — automatic retry (1s/2s + jitter, up to 3 attempts) for 5xx and network errors
- **Concurrency limiter** — caps outbound HTTP requests via `MAX_CONCURRENCY` env var (default 10); prevents overwhelming target sites
- **Configurable content fetch timeout** — `CONTENT_TIMEOUT_MS` env var (default 5000ms) for full-article fetching
- **Mozilla Readability integration** — `readability=true` parameter strips navigation, sidebars, and ads; returns clean article HTML without requiring a content CSS selector
- **Full-content extraction tests** — validates selectors against live feeds (Diego A. Manrique, Roger Senserrich, Vozpópuli)
- **vdrss-url-builder skill** — step-by-step guide for generating VeryDirtyRSS feed URLs from any webpage, covering CSS selector identification, URL assembly, pagination, full-content fetching, and JSON API support

### Fixed
- **curl in Docker image** — added to production image for container health checks

### Changed
- README and AGENTS.md updated with documentation for all new features, env vars, and parameters
- Builder UI and readability parameter documented in README

## [1.5.0] - 2026-06-23

### Added
- RSS feed builder web UI at `/` — vanilla HTML/CSS/JS form for all RSS and JSON parameters
- Content-negotiated root route: HTML interface for browsers, JSON docs for API clients
- Playwright E2E test suite (19 tests) covering the builder UI, source toggles, feed generation, and error handling
- test-results/ to .gitignore

### Changed
- Dockerfile now bundles public/ directory for the builder UI

## [1.4.0] - 2026-06-23

### Added
- GitHub Actions workflow to build, tag, and push Docker image to Docker Hub on push to main or version tags
- Automated test gate before Docker build in CI pipeline

## [1.3.0] - 2026-06-23

### Added
- JSON-to-RSS support — `source=json` parameter to turn any JSON API into an RSS feed using JSON path selectors
- JSON path resolver with dot notation, bracket indexing, and wildcard support
- `feedTitle` and `feedDescription` query parameters to override auto-detected feed metadata
- Documentation for JSON sourcing in README.md

## [1.2.0] - 2026-06-23

### Added
- AGENTS.md with comprehensive project guide for future AI agents
- commit-manager skill for conventional commits, version bumps, and changelog management
