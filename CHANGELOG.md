# Changelog

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
