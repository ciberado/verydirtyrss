import express from 'express';
import path from 'path';
import axios from 'axios';
import { fileURLToPath } from 'url';
import { FileCache } from './cache.js';
import { generateRssXml, generateRssXmlFromJson, type FeedGenerationParams } from './rss.js';
import { logger } from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, '..', 'public');

const app = express();
const PORT = process.env.PORT || 3000;

/**
 * User-Agent sent with every HTTP request.
 * Configure with `USER_AGENT` env var; defaults to a standard Chrome UA
 * which most sites do not block (unlike the previous custom UA).
 */
const USER_AGENT = process.env.USER_AGENT ||
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const defaultCacheTtlSeconds = Number(process.env.CACHE_TTL_SECONDS || '900');
const defaultCacheTtlMs = Number.isFinite(defaultCacheTtlSeconds) && defaultCacheTtlSeconds > 0
  ? defaultCacheTtlSeconds * 1000
  : 900000;
const defaultCacheEnabled = process.env.CACHE_ENABLED !== 'false';

function createFetchHtmlWithCache(cache: FileCache) {
  return async (url: string, timeoutMs: number): Promise<string> => {
  const cacheKey = `GET:${url}`;
  const cached = await cache.get(cacheKey);
  if (cached !== null) {
    return cached;
  }

  const response = await axios.get(url, {
    headers: {
      'User-Agent': USER_AGENT,
    },
    timeout: timeoutMs,
  });

  const html = String(response.data);
  await cache.set(cacheKey, html);
  return html;
  };
}

function createFetchJsonWithCache(cache: FileCache) {
  return async (url: string, timeoutMs: number): Promise<unknown> => {
  const cacheKey = `JSON:GET:${url}`;
  const cached = await cache.get(cacheKey);
  if (cached !== null) {
    return JSON.parse(cached);
  }

  const response = await axios.get(url, {
    headers: {
      'User-Agent': USER_AGENT,
    },
    timeout: timeoutMs,
  });

  const json = response.data;
  await cache.set(cacheKey, JSON.stringify(json));
  return json;
  };
}

// Main RSS generation endpoint
app.get('/rss', async (req, res) => {
  try {
    const searchParams = req.query;
    
    // Extract parameters with defaults
    const targetUrl = new URL(searchParams.url as string || 'https://install.doctor/blog');
    const siteUrl = targetUrl.origin;
    const itemSelector = searchParams.item as string || '.post';
    const titleSelector = searchParams.title as string || '.post-title';
    const descriptionSelector = searchParams.description as string || '.paragraph-intro';
    const linkSelector = searchParams.link as string || '.post-link';
    const pubDateSelector = searchParams.pubDate as string || '.publish-date time';
    const imageSelector = searchParams.image as string || '.featured-image';
    const modifiedSelector = searchParams.modified as string || '.modified-date time';
    const contentSelector = searchParams.content as string || '.post-content';
    const creatorSelector = searchParams.creator as string || '.author-date a';
    const previousSelector = searchParams.previous as string || '';
    const cacheEnabled = (searchParams.cache as string || 'true') !== 'false';
    const cacheTtlSeconds = Number(searchParams.cacheTtlSeconds as string || defaultCacheTtlSeconds);
    const sourceType = (searchParams.source as string || 'html') as 'html' | 'json';
    const feedTitle = searchParams.feedTitle as string || undefined;
    const feedDescription = searchParams.feedDescription as string || undefined;
    const cache = new FileCache({
      ttlMs: Number.isFinite(cacheTtlSeconds) && cacheTtlSeconds > 0 ? cacheTtlSeconds * 1000 : defaultCacheTtlMs,
      enabled: defaultCacheEnabled && cacheEnabled,
    });
    const fetchHtmlWithCache = createFetchHtmlWithCache(cache);
    const generationParams: FeedGenerationParams = {
      targetUrl,
      siteUrl,
      selectors: {
        itemSelector,
        titleSelector,
        descriptionSelector,
        linkSelector,
        pubDateSelector,
        imageSelector,
        modifiedSelector,
        contentSelector,
        creatorSelector,
        previousSelector,
      },
      fetchContent: searchParams.fetchContent === 'true',
      feedUrl: `${req.protocol}://${req.get('host')}${req.originalUrl}`,
      feedTitle,
      feedDescription,
    };

    if (sourceType === 'json') {
      const jsonSelectors = {
        itemSelector: searchParams.item as string || 'data',
        titleSelector: searchParams.title as string || 'title',
        descriptionSelector: searchParams.description as string || 'description',
        linkSelector: searchParams.link as string || 'url',
        pubDateSelector: searchParams.pubDate as string || 'pubDate',
        imageSelector: searchParams.image as string || 'image',
        modifiedSelector: searchParams.modified as string || 'modified',
        contentSelector: searchParams.content as string || '',
        creatorSelector: searchParams.creator as string || 'author',
      };

      const fetchJsonWithCache = createFetchJsonWithCache(cache);

      const xml = await generateRssXmlFromJson({
        ...generationParams,
        sourceType: 'json',
        jsonSelectors,
      }, fetchJsonWithCache);

      res.set('Content-Type', 'application/rss+xml; charset=utf-8');
      res.send(xml);
    } else {
      const xml = await generateRssXml(generationParams, fetchHtmlWithCache);
      
      // Return RSS XML
      res.set('Content-Type', 'application/rss+xml; charset=utf-8');
      res.send(xml);
    }
    
  } catch (error) {
    logger.error({ err: error }, 'Error generating RSS feed');
    res.status(500).json({
      error: 'Failed to generate RSS feed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Documentation endpoint / builder UI
app.get('/', (req, res) => {
  // Serve the HTML builder interface to browsers (only when text/html is explicitly accepted)
  const accept = req.headers.accept || '';
  if (accept.includes('text/html')) {
    return res.sendFile(path.join(publicDir, 'index.html'));
  }
  // Serve JSON documentation to API clients
  res.json({
    name: 'VeryDirtyRSS',
    description: 'Transform any HTML page or JSON API into an RSS feed',
    version: '1.4.0',
    endpoints: {
      '/': {
        method: 'GET',
        description: 'HTML builder interface (browsers) or this JSON document (API clients)',
      },
      '/rss': {
        method: 'GET',
        description: 'Generate RSS feed from an HTML page (CSS selectors) or JSON API (JSON path selectors with source=json)',
        parameters: {
          url: 'Target URL to scrape (default: https://install.doctor/blog)',
          item: 'HTML: CSS selector for post items. JSON: JSON path to items array (default: .post / data)',
          title: 'HTML: CSS selector for post titles. JSON: JSON path to title field (default: .post-title / title)',
          description: 'HTML: CSS selector for post descriptions. JSON: JSON path to description field (default: .paragraph-intro / description)',
          link: 'HTML: CSS selector for post links. JSON: JSON path to URL field (default: .post-link / url)',
          pubDate: 'HTML: CSS selector for publish dates. JSON: JSON path to date field (default: .publish-date time / pubDate)',
          image: 'HTML: CSS selector for featured images. JSON: JSON path to image URL field (default: .featured-image / image)',
          modified: 'HTML: CSS selector for modified dates. JSON: JSON path to modified date field (default: .modified-date time / modified)',
          content: 'HTML: CSS selector for full content. JSON: JSON path to content field (default: .post-content / empty)',
          creator: 'HTML: CSS selector for authors. JSON: JSON path to author field (default: .author-date a / author)',
          previous: 'CSS selector for previous entries link/button to crawl older pages recursively (default: disabled)',
          source: 'Set to "json" to treat the response as JSON and interpret selectors as JSON paths (default: "html")',
          feedTitle: 'Override the RSS feed title (default: auto-detected from page title or JSON root title field)',
          feedDescription: 'Override the RSS feed description (default: auto-detected)',
          cache: 'Set to "false" to disable temporary file cache (default: true)',
          cacheTtlSeconds: 'Override cache TTL in seconds for this request (default: env CACHE_TTL_SECONDS or 900)',
          fetchContent: 'Set to "true" to fetch full article content (default: false)',
        },
        example: '/rss?url=https://example.com/blog&item=.article&title=h2&description=.excerpt&previous=.pagination .prev a',
        jsonExample: '/rss?url=https://api.example.com/activities&source=json&item=data&title=title&description=description&link=url',
      },
      '/health': {
        method: 'GET',
        description: 'Health check endpoint',
      },
    }
  });
});

if (import.meta.url === `file://${process.argv[1]}`) {
  app.listen(PORT, () => {
    logger.info(`VeryDirtyRSS server running on port ${PORT}`);
    logger.info(`Visit http://localhost:${PORT} for documentation`);
  });
}

export { app, createFetchHtmlWithCache };