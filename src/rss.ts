import * as cheerio from 'cheerio';
import RSS from 'rss';
import { logger } from './logger.js';

export type FeedSelectors = {
  itemSelector: string;
  titleSelector: string;
  descriptionSelector: string;
  linkSelector: string;
  pubDateSelector: string;
  imageSelector: string;
  modifiedSelector: string;
  contentSelector: string;
  creatorSelector: string;
  previousSelector: string;
};

export type JsonSelectors = {
  itemSelector: string;
  titleSelector: string;
  descriptionSelector: string;
  linkSelector: string;
  pubDateSelector: string;
  imageSelector: string;
  modifiedSelector: string;
  contentSelector: string;
  creatorSelector: string;
};

export type FeedSourceType = 'html' | 'json';

export type FeedGenerationParams = {
  targetUrl: URL;
  siteUrl: string;
  selectors: FeedSelectors;
  fetchContent: boolean;
  feedUrl: string;
  sourceType?: FeedSourceType;
  jsonSelectors?: JsonSelectors;
  feedTitle?: string;
  feedDescription?: string;
};

export type FetchHtmlFn = (url: string, timeoutMs: number) => Promise<string>;
export type FetchJsonFn = (url: string, timeoutMs: number) => Promise<unknown>;

// Helper function to resolve relative URLs
export function resolveUrl(url: string, base: string): string {
  try {
    return new URL(url, base).href;
  } catch {
    return url;
  }
}

// Helper function to extract text content safely
export function extractText(element: cheerio.Cheerio<any>, selector: string): string {
  if (!element.length) return '';

  const target = selector ? element.find(selector).first() : element;
  return target.text().trim();
}

// Helper function to extract href or src attributes
export function extractLink(element: cheerio.Cheerio<any>, selector: string, siteUrl: string): string {
  if (!element.length) return '';

  const target = selector ? element.find(selector).first() : element;
  const href = target.attr('href') || target.attr('src') || '';
  return href ? resolveUrl(href, siteUrl) : '';
}

// Helper function to extract datetime attributes or text
export function extractDate(element: cheerio.Cheerio<any>, selector: string): Date | null {
  if (!element.length) return null;

  const target = selector ? element.find(selector).first() : element;
  const datetime = target.attr('datetime') || target.text().trim();

  if (!datetime) return null;

  const date = new Date(datetime);
  return Number.isNaN(date.getTime()) ? null : date;
}

// Helper function to locate the previous page URL from the current page
export function extractPreviousPageUrl($: cheerio.CheerioAPI, selector: string, currentPageUrl: string): string {
  if (!selector) return '';

  const target = $(selector).first();
  if (!target.length) return '';

  const href = target.attr('href') || target.find('a').first().attr('href') || '';
  return href ? resolveUrl(href, currentPageUrl) : '';
}

export async function generateRssXml(params: FeedGenerationParams, fetchHtml: FetchHtmlFn): Promise<string> {
  const {
    targetUrl,
    siteUrl,
    selectors,
    fetchContent,
    feedUrl,
    feedTitle: titleOverride,
    feedDescription: descOverride,
  } = params;

  let currentPageUrl = targetUrl.href;
  const visitedPageUrls = new Set<string>();
  let pageNumber = 0;
  let feed: RSS | null = null;

  while (true) {
    if (visitedPageUrls.has(currentPageUrl)) {
      logger.warn('Stopping pagination: already visited %s', currentPageUrl);
      break;
    }

    visitedPageUrls.add(currentPageUrl);
    pageNumber += 1;
    logger.debug('Fetching page %d: %s', pageNumber, currentPageUrl);

    const html = await fetchHtml(currentPageUrl, 10000);
    const $ = cheerio.load(html);

    if (!feed) {
      const siteTitle = titleOverride || $('title').text().trim() || $('h1').first().text().trim() || 'RSS Feed';
      const siteDescription = descOverride || $('meta[name="description"]').attr('content') ||
        $('meta[property="og:description"]').attr('content') ||
        'Generated RSS feed from HTML page';

      feed = new RSS({
        title: siteTitle,
        description: siteDescription,
        feed_url: feedUrl,
        site_url: siteUrl,
        language: $('html').attr('lang') || 'en',
        pubDate: new Date(),
        generator: 'VeryDirtyRSS',
      });
    }

    const items = $(selectors.itemSelector);
    logger.debug('Found %d items using selector: %s on page %d', items.length, selectors.itemSelector, pageNumber);

    for (let i = 0; i < items.length; i += 1) {
      const item = items.eq(i);

      const title = extractText(item, selectors.titleSelector);
      const description = extractText(item, selectors.descriptionSelector);
      const link = extractLink(item, selectors.linkSelector, siteUrl);
      const creator = extractText(item, selectors.creatorSelector);
      const pubDate = extractDate(item, selectors.pubDateSelector);
      const modifiedDate = extractDate(item, selectors.modifiedSelector);
      const imageUrl = extractLink(item, selectors.imageSelector, siteUrl);

      if (!title && !description) continue;

      let content = description;

      if (link && selectors.contentSelector && fetchContent) {
        try {
          const articleHtml = await fetchHtml(link, 5000);
          const article$ = cheerio.load(articleHtml);
          const fullContent = article$(selectors.contentSelector).html();
          if (fullContent) {
            content = fullContent;
          }
        } catch {
          logger.warn('Failed to fetch full content for: %s', link);
        }
      }

      feed.item({
        title: title || 'Untitled',
        description: content || description || 'No description available',
        url: link || siteUrl,
        author: creator || undefined,
        date: pubDate || modifiedDate || new Date(),
        enclosure: imageUrl ? { url: imageUrl } : undefined,
      });
    }

    if (!selectors.previousSelector) {
      break;
    }

    const previousPageUrl = extractPreviousPageUrl($, selectors.previousSelector, currentPageUrl);
    if (!previousPageUrl) {
      logger.debug('No previous page found with selector: %s', selectors.previousSelector);
      break;
    }

    currentPageUrl = previousPageUrl;
  }

  if (!feed) {
    throw new Error('Unable to initialize RSS feed from target page');
  }

  return feed.xml({ indent: true });
}

// --- JSON Path Helpers ---

/**
 * Resolve a dot/bracket-notation path on a JSON object.
 *
 * Supported patterns:
 *   - `field.subfield`         nested property access
 *   - `$.field.subfield`       same with leading `$.`
 *   - `array[*]`               wildcard (returns the array as-is)
 *   - `array[0]`               indexed access
 *   - `field[0].subfield`      indexed then subfield
 */
export function resolveJsonPath(obj: unknown, path: string): unknown {
  if (!path || obj === undefined || obj === null) return undefined;

  // Strip leading $. or $
  const clean = path.replace(/^\$\.?\s*/, '').trim();
  if (!clean) return obj;

  // Tokenize: split on dots not inside brackets
  const tokens: string[] = [];
  let buf = '';
  let depth = 0;
  for (const ch of clean) {
    if (ch === '[') { depth += 1; buf += ch; }
    else if (ch === ']') { depth -= 1; buf += ch; }
    else if (ch === '.' && depth === 0) { if (buf) { tokens.push(buf); buf = ''; } }
    else { buf += ch; }
  }
  if (buf) tokens.push(buf);

  let value: unknown = obj;

  for (const token of tokens) {
    if (value === null || value === undefined) return undefined;

    // Match: fieldName[*] or fieldName[number]
    const bracketMatch = /^([\w$_-]+)\[(\*|\d+)]$/.exec(token);
    if (bracketMatch) {
      const [, field, indexOrWild] = bracketMatch;
      value = (value as Record<string, unknown>)[field];
      if (indexOrWild === '*') {
        // Return the array itself – the caller iterates
        continue;
      }
      if (Array.isArray(value)) {
        value = value[Number(indexOrWild)];
      } else {
        return undefined;
      }
    } else if (token === '*') {
      // Standalone wildcard – pass through
      continue;
    } else {
      value = (value as Record<string, unknown>)[token];
    }
  }

  return value;
}

/** Extract an array from a JSON object using a path selector. */
export function getJsonArray(obj: unknown, selector: string): unknown[] {
  const value = resolveJsonPath(obj, selector);
  if (Array.isArray(value)) return value;
  return [];
}

/** Extract a string value from an item using a JSON path selector. */
export function getJsonString(item: Record<string, unknown>, selector: string): string {
  if (!selector) return '';
  const value = resolveJsonPath(item, selector);
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

/** Extract a Date from an item using a JSON path selector. */
export function getJsonDate(item: Record<string, unknown>, selector: string): Date | null {
  if (!selector) return null;
  const value = resolveJsonPath(item, selector);
  if (value === undefined || value === null) return null;
  // Pass numbers directly (timestamps), parse strings
  const date = typeof value === 'number' ? new Date(value) : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Extract a URL from an item using a JSON path selector, resolving relative URLs. */
export function getJsonLink(item: Record<string, unknown>, selector: string, siteUrl: string): string {
  if (!selector) return '';
  const value = resolveJsonPath(item, selector);
  if (value === undefined || value === null) return '';
  return resolveUrl(String(value), siteUrl);
}

// --- JSON RSS Generation ---

export async function generateRssXmlFromJson(
  params: FeedGenerationParams,
  fetchJson: FetchJsonFn,
): Promise<string> {
  const { targetUrl, siteUrl, jsonSelectors, feedUrl, feedTitle: titleOverride, feedDescription: descOverride } = params;

  if (!jsonSelectors) {
    throw new Error('jsonSelectors are required for JSON source type');
  }

  const data = await fetchJson(targetUrl.href, 10000);

  if (data === undefined || data === null) {
    throw new Error('JSON source returned empty response');
  }

  const items = getJsonArray(data, jsonSelectors.itemSelector);
  logger.debug('Found %d items using JSON selector: %s', items.length, jsonSelectors.itemSelector);

  // Build feed metadata from the JSON root (or use explicit overrides)
  const root = (data && typeof data === 'object') ? (data as Record<string, unknown>) : {};
  const feedTitle = titleOverride || getJsonString(root, 'title') || 'JSON Feed';
  const feedDescription = descOverride || getJsonString(root, 'description') || 'Generated RSS feed from JSON API';

  const feed = new RSS({
    title: feedTitle,
    description: feedDescription,
    feed_url: feedUrl,
    site_url: siteUrl,
    pubDate: new Date(),
    generator: 'VeryDirtyRSS',
  });

  for (const rawItem of items) {
    if (!rawItem || typeof rawItem !== 'object') continue;
    const item = rawItem as Record<string, unknown>;

    const title = getJsonString(item, jsonSelectors.titleSelector);
    const description = getJsonString(item, jsonSelectors.descriptionSelector);
    const link = getJsonLink(item, jsonSelectors.linkSelector, siteUrl);
    const creator = getJsonString(item, jsonSelectors.creatorSelector);
    const pubDate = getJsonDate(item, jsonSelectors.pubDateSelector);
    const modifiedDate = getJsonDate(item, jsonSelectors.modifiedSelector);
    const imageUrl = getJsonLink(item, jsonSelectors.imageSelector, siteUrl);

    if (!title && !description) continue;

    let content = description;
    if (jsonSelectors.contentSelector) {
      const fullContent = getJsonString(item, jsonSelectors.contentSelector);
      if (fullContent) content = fullContent;
    }

    feed.item({
      title: title || 'Untitled',
      description: content || 'No description available',
      url: link || siteUrl,
      author: creator || undefined,
      date: pubDate || modifiedDate || new Date(),
      enclosure: imageUrl ? { url: imageUrl } : undefined,
    });
  }

  return feed.xml({ indent: true });
}
