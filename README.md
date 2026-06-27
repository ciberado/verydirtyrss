# VeryDirtyRSS

[![Docker](https://img.shields.io/badge/docker-%230db7ed.svg?style=for-the-badge&logo=docker&logoColor=white)](https://github.com/ciberado/verydirtyrss)
[![TypeScript](https://img.shields.io/badge/typescript-%23007ACC.svg?style=for-the-badge&logo=typescript&logoColor=white)](https://github.com/ciberado/verydirtyrss)
[![Node.js](https://img.shields.io/badge/node.js-6DA55F?style=for-the-badge&logo=node.js&logoColor=white)](https://github.com/ciberado/verydirtyrss)

A simple web server that transforms any HTML page or JSON API into an RSS feed using configurable selectors.

## Features

- 🔄 **Transform any webpage** into a valid RSS feed
- 🎯 **Configurable CSS selectors** for extracting content
- 🔗 **JSON API support** — use `source=json` with JSON path selectors to turn any REST API into an RSS feed
- ⚡ **Optional full article content** fetching
- 🌐 **Auto-detection** of site language and metadata
- 🚀 **Fast and lightweight** Node.js server
- 🐳 **Docker support** with multistage builds
- 🔒 **Security-focused** with non-root user in container
- 🔁 **Automatic retry** — Exponential backoff with jitter for transient HTTP failures
- 🚦 **Concurrency limiting** — Prevents outbound requests from overwhelming target sites
- 📋 **Structured logging** — Pino with level control, pretty-print in development, JSON in production

## Quick Start

### Using Docker (Recommended)

```bash
# Build the image
docker build -t verydirtyrss .

# Run the container
docker run -p 3000:3000 verydirtyrss
```

### Using Docker Compose with Tailscale

For private network access via Tailscale:

```bash
# Copy environment template
cp .env.example .env

# Edit .env and add your Tailscale auth key
# Get your auth key from: https://login.tailscale.com/admin/settings/keys
vim .env

# Start services
docker-compose up -d

# Check status
docker-compose ps

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

Once running, the service will be accessible via your Tailscale network at the hostname `verydirtyrss`.

### Local Development

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Start the server
npm start
```

## Usage

### Basic Usage

Access the RSS endpoint with a target URL:

```
GET /rss?url=https://example.com/blog
```

### Advanced Configuration

Use custom CSS selectors to extract specific content:

```
GET /rss?url=https://www.vozpopuli.com/redaccion/roger-senserrich&item=article&title=h2&description=div.text-inherit&link=a
```

### JSON API Source

Turn any JSON API into an RSS feed by adding `&source=json`. Selectors become JSON path expressions instead of CSS selectors:

```
GET /rss?url=https://api.example.com/activities&source=json&item=items&title=title&description=summary&link=permalink
```

### Available Parameters

| Parameter | Description | Default Value |
|-----------|-------------|---------------|
| `url` | Target URL to scrape (HTML page or JSON endpoint) | `https://install.doctor/blog` |
| `item` | HTML: CSS selector for post items. JSON: JSON path to items array | `.post` / `data` |
| `title` | HTML: CSS selector for post titles. JSON: JSON path to title field | `.post-title` / `title` |
| `description` | HTML: CSS selector for post descriptions. JSON: JSON path to description field | `.paragraph-intro` / `description` |
| `link` | HTML: CSS selector for post links. JSON: JSON path to URL field | `.post-link` / `url` |
| `pubDate` | HTML: CSS selector for publish dates. JSON: JSON path to date field | `.publish-date time` / `pubDate` |
| `image` | HTML: CSS selector for featured images. JSON: JSON path to image URL field | `.featured-image` / `image` |
| `modified` | HTML: CSS selector for modified dates. JSON: JSON path to modified date field | `.modified-date time` / `modified` |
| `content` | HTML: CSS selector for full content. JSON: JSON path to content field | `.post-content` / (empty) |
| `creator` | HTML: CSS selector for authors. JSON: JSON path to author field | `.author-date a` / `author` |
| `previous` | CSS selector for previous entries button/link to crawl older pages recursively | disabled |
| `source` | Set to `"json"` to treat the response as JSON and interpret selectors as JSON paths | `html` |
| `feedTitle` | Override the RSS feed title (auto-detected from HTML `<title>` or JSON root `title` field) | auto |
| `feedDescription` | Override the RSS feed description | auto |
| `cache` | Set to `"false"` to disable temporary file cache | `true` |
| `cacheTtlSeconds` | Override cache TTL in seconds for this request | `900` |
| `fetchContent` | Set to `"true"` to fetch full article content | `false` |
| `readability` | Set to `"true"` to clean article content via Mozilla Readability (strips navigation, sidebars, ads — requires `fetchContent=true`) | `false` |

## Examples

### News Website (Spanish)
```bash
curl "http://localhost:3000/rss?url=https://www.vozpopuli.com/redaccion/roger-senserrich&item=article&title=h2&description=div.text-inherit&link=a"
```

### Blog with Custom Selectors
```bash
curl "http://localhost:3000/rss?url=https://example.com/blog&item=.article&title=h2&description=.excerpt&link=.read-more"
```

### With Full Content Fetching
```bash
curl "http://localhost:3000/rss?url=https://example.com/blog&fetchContent=true&content=.post-body"
```

### Crawl All Previous Entries
```bash
curl "http://localhost:3000/rss?url=https://example.com/blog&item=.article&title=h2&link=a&previous=.pagination .prev a"
```

### Disable Cache For One Request
```bash
curl "http://localhost:3000/rss?url=https://example.com/blog&previous=.pagination .prev a&cache=false"
```

### Use A Short Cache TTL
```bash
curl "http://localhost:3000/rss?url=https://example.com/blog&cacheTtlSeconds=120"
```

### JSON API to RSS (Real Example)
```bash
curl "http://localhost:3000/rss?url=https://www.barcelona.cat/capitalmundialarquitectura/es/api/activities?page=1&limit=5&source=json&item=items&title=title&description=summary&link=permalink&image=image&creator=organitzadors_text"
```

### JSON API with Custom Feed Title
```bash
curl "http://localhost:3000/rss?url=https://api.example.com/activities&source=json&item=items&title=title&description=summary&link=permalink&feedTitle=My%20Activities&feedDescription=Activity%20feed"
```

### Full-Text Article Content with Readability
```bash
curl "http://localhost:3000/rss?url=https://www.vozpopuli.com/redaccion/roger-senserrich&item=article&title=h2&description=div.text-inherit&link=a&fetchContent=true&readability=true"
```

## JSON Path Reference

When using `source=json`, selectors are interpreted as simple JSON path expressions, not CSS selectors.

| Pattern | Example | Description |
|---------|---------|-------------|
| `.` dot notation | `items.title` | Access nested fields |
| `$.` prefix | `$.data.name` | Optional root prefix (ignored) |
| `[*]` wildcard | `items[*]` | Select array (use for the `item` parameter) |
| `[n]` index | `items[0].name` | Access array by numeric index |

The path syntax works for the `item` parameter (selects the items array from the JSON root) and for field selectors like `title`, `description`, `link`, etc. (extract values from each item).

## API Endpoints

### `GET /rss`
Generate RSS feed from an HTML page (CSS selectors) or JSON API (JSON path selectors with `source=json`).

### `GET /health`
Health check endpoint for monitoring.

### `GET /`
**Interactive RSS Feed Builder** (HTML UI) — served to browsers that send `Accept: text/html`.
Provides a form where you can enter the target URL and all selector parameters, preview the
generated RSS XML, and copy or open the feed URL. API clients receive a JSON document with
endpoint descriptions and available parameters instead.

## Docker Commands

### Standard Docker
```bash
# Build image
npm run docker:build

# Run container
npm run docker:run

# Development with volume mounting
npm run docker:dev
```

### Docker Compose with Tailscale
```bash
# Start services with Tailscale
npm run compose:up

# Stop services
npm run compose:down

# View logs
npm run compose:logs
```

## Development

### Prerequisites
- Node.js 20+
- TypeScript
- Docker (optional)

### Setup
```bash
# Clone the repository
git clone https://github.com/ciberado/verydirtyrss.git
cd verydirtyrss

# Install dependencies
npm install

# Start development server (with pretty-printed debug logs)
npm run dev
```

### Building
```bash
# TypeScript compilation
npm run build

# Docker build
docker build -t verydirtyrss .
```

### Running tests
```bash
# Unit tests (cache, RSS generation, endpoints)
npm test

# Live feed integration tests (validate selectors against real sites)
npx vitest run tests/feeds.test.ts --pool=forks
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | HTTP server port |
| `NODE_ENV` | — | Set to `production` for JSON logging, `development` for pretty-printed debug output |
| `LOG_LEVEL` | `debug` (dev) / `info` (prod) | Pino log level: `trace`, `debug`, `info`, `warn`, `error`, `fatal` |
| `USER_AGENT` | Chrome 120 on Linux | User-Agent header sent with every outbound HTTP request |
| `CACHE_ENABLED` | `true` | Set to `false` to disable disk cache globally |
| `CACHE_TTL_SECONDS` | `900` (15 min) | Default cache TTL |
| `MAX_CONCURRENCY` | `10` | Maximum concurrent outbound HTTP requests |
| `CONTENT_TIMEOUT_MS` | `5000` | Timeout in milliseconds for `fetchContent` article fetches |

### Examples

```bash
# Debug logging with verbose output
LOG_LEVEL=debug npm start

# Custom User-Agent (some sites block the default)
USER_AGENT="Mozilla/5.0 ... Firefox/130.0" npm start

# Light concurrency for fragile sites
MAX_CONCURRENCY=3 npm start

# Combine options
PORT=8080 CACHE_TTL_SECONDS=1800 CONTENT_TIMEOUT_MS=8000 npm start
```

## Architecture

```
src/
├── index.ts      Express app entry. Defines GET /rss, /health, /.
│                 Creates FileCache, wires fetchHtmlWithCache(),
│                 calls generateRssXml(). Exports app + createFetchHtmlWithCache.
├── rss.ts        Core RSS generation. Parses HTML with cheerio, extracts
│                 items via CSS selectors, builds RSS XML via the rss package.
│                 Handles multi-page crawling (previous selector),
│                 full-content fetching, metadata extraction.
├── cache.ts      FileCache class. Disk-based key/value store with TTL.
│                 SHA-256 hashed keys as filenames in os.tmpdir().
│                 Atomic writes via temp-file + rename.
├── fetch.ts      HTTP client with retry logic. Exponential backoff (1s/2s)
│                 with jitter, only retries 5xx/network errors.
│                 Wrapped in concurrency limiter.
├── limiter.ts    Concurrency limiter. Promise-based semaphore that caps
│                 how many HTTP requests are in-flight simultaneously.
└── logger.ts     Pino logger. Debug level with pretty-print in dev;
                  info level with JSON output in production.
```

### Data flow

1. **GET /rss?url=...&item=...&title=...** → Express handler
2. `createFetchHtmlWithCache(cache)` returns a fetch function that checks cache before HTTP GET (axios with retry + concurrency limit)
3. If `source=json`, the JSON variant reads the response, parses JSON, and applies JSON path selectors via `generateRssXmlFromJson()`
4. Otherwise, `generateRssXml()` loads HTML via cheerio, extracts items using CSS selectors, iterates pages via `previousSelector`
5. For each matched item: extracts title, description, link, date, author, image URL
6. If `fetchContent=true` and content selector is set, fetches each article's full HTML (with retry and concurrency limit)
7. Returns RSS XML (`application/rss+xml`)
8. Cache stores raw HTML per URL with TTL

### Resilience features

- **Retry**: Transient HTTP failures (timeout, 5xx, DNS errors) retry up to 3 times with exponential backoff (1s, 2s + jitter). 4xx errors are immediate.
- **Throttling**: Outbound requests are capped to prevent overwhelming target sites and getting your IP rate-limited. Defaults to 10 concurrent.
- **Cycle detection**: Pagination loop stops when a URL has already been visited (`visitedPageUrls` Set).

## Security Features

- Non-root user in Docker container
- Input validation and error handling
- Request timeouts to prevent hanging
- Health checks for container monitoring

## Contributing

1. Fork the repository on [GitHub](https://github.com/ciberado/verydirtyrss)
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Troubleshooting

### Common Issues

**Q: RSS feed is empty**
- Check if your CSS selectors match the target website's structure
- Verify the website is accessible and returns HTML content
- Use browser dev tools to inspect the HTML structure

**Q: Container fails health check**
- Ensure port 3000 is not blocked
- Check container logs: `docker logs <container-id>`
- Verify the application started successfully

**Q: TypeScript build fails**
- Ensure all dependencies are installed: `npm install`
- Check for syntax errors in TypeScript files
- Verify TypeScript version compatibility

## Support

For issues and questions, please open an issue on [GitHub Issues](https://github.com/ciberado/verydirtyrss/issues) or contact the maintainers.
