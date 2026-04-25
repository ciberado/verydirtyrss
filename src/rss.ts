import * as cheerio from 'cheerio';
import RSS from 'rss';

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

export type FeedGenerationParams = {
  targetUrl: URL;
  siteUrl: string;
  selectors: FeedSelectors;
  fetchContent: boolean;
  feedUrl: string;
};

export type FetchHtmlFn = (url: string, timeoutMs: number) => Promise<string>;

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
  } = params;

  let currentPageUrl = targetUrl.href;
  const visitedPageUrls = new Set<string>();
  let pageNumber = 0;
  let feed: RSS | null = null;

  while (true) {
    if (visitedPageUrls.has(currentPageUrl)) {
      console.warn(`Stopping pagination: already visited ${currentPageUrl}`);
      break;
    }

    visitedPageUrls.add(currentPageUrl);
    pageNumber += 1;
    console.log(`Fetching page ${pageNumber}: ${currentPageUrl}`);

    const html = await fetchHtml(currentPageUrl, 10000);
    const $ = cheerio.load(html);

    if (!feed) {
      const siteTitle = $('title').text().trim() || $('h1').first().text().trim() || 'RSS Feed';
      const siteDescription = $('meta[name="description"]').attr('content') ||
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
    console.log(`Found ${items.length} items using selector: ${selectors.itemSelector} on page ${pageNumber}`);

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
          console.warn(`Failed to fetch full content for: ${link}`);
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
      console.log(`No previous page found with selector: ${selectors.previousSelector}`);
      break;
    }

    currentPageUrl = previousPageUrl;
  }

  if (!feed) {
    throw new Error('Unable to initialize RSS feed from target page');
  }

  return feed.xml({ indent: true });
}
