# Changelog

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
