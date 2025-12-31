# VeryDirtyRSS

[![Docker](https://img.shields.io/badge/docker-%230db7ed.svg?style=for-the-badge&logo=docker&logoColor=white)](https://github.com/ciberado/verydirtyrss)
[![TypeScript](https://img.shields.io/badge/typescript-%23007ACC.svg?style=for-the-badge&logo=typescript&logoColor=white)](https://github.com/ciberado/verydirtyrss)
[![Node.js](https://img.shields.io/badge/node.js-6DA55F?style=for-the-badge&logo=node.js&logoColor=white)](https://github.com/ciberado/verydirtyrss)

A simple web server that transforms any HTML page into an RSS feed using configurable CSS selectors.

## Features

- 🔄 **Transform any webpage** into a valid RSS feed
- 🎯 **Configurable CSS selectors** for extracting content
- 🚀 **Fast and lightweight** Node.js server
- 🐳 **Docker support** with multistage builds
- 🔒 **Security-focused** with non-root user in container
- ⚡ **Optional full article content** fetching
- 🌐 **Auto-detection** of site language and metadata

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
GET /rss?url=https://www.vozpopuli.com/redaccion/roger-senserrich&item=article&title=header&description=.entradilla&link=a
```

### Available Parameters

| Parameter | Description | Default Value |
|-----------|-------------|---------------|
| `url` | Target URL to scrape | `https://install.doctor/blog` |
| `item` | CSS selector for post items | `.post` |
| `title` | CSS selector for post titles | `.post-title` |
| `description` | CSS selector for post descriptions | `.paragraph-intro` |
| `link` | CSS selector for post links | `.post-link` |
| `pubDate` | CSS selector for publish dates | `.publish-date time` |
| `image` | CSS selector for featured images | `.featured-image` |
| `modified` | CSS selector for modified dates | `.modified-date time` |
| `content` | CSS selector for full content | `.post-content` |
| `creator` | CSS selector for authors | `.author-date a` |
| `fetchContent` | Set to `"true"` to fetch full article content | `false` |

## Examples

### News Website (Spanish)
```bash
curl "http://localhost:3000/rss?url=https://www.vozpopuli.com/redaccion/roger-senserrich&item=article&title=header&description=.entradilla&link=a"
```

### Blog with Custom Selectors
```bash
curl "http://localhost:3000/rss?url=https://example.com/blog&item=.article&title=h2&description=.excerpt&link=.read-more"
```

### With Full Content Fetching
```bash
curl "http://localhost:3000/rss?url=https://example.com/blog&fetchContent=true&content=.post-body"
```

## API Endpoints

### `GET /rss`
Generate RSS feed from HTML page with configurable selectors.

### `GET /health`
Health check endpoint for monitoring.

### `GET /`
API documentation and endpoint information.

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

# Start development server
npm run dev
```

### Building
```bash
# TypeScript compilation
npm run build

# Docker build
docker build -t verydirtyrss .
```

## Configuration

The server runs on port 3000 by default. You can override this with the `PORT` environment variable:

```bash
PORT=8080 npm start
```

## Architecture

- **Express.js** - Web server framework
- **Cheerio** - Server-side jQuery for HTML parsing
- **Axios** - HTTP client for fetching web pages
- **RSS** - RSS feed generation library
- **TypeScript** - Type safety and better development experience

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