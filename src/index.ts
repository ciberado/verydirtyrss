import express from 'express';
import axios from 'axios';
import * as cheerio from 'cheerio';
import RSS from 'rss';

const app = express();
const PORT = process.env.PORT || 3000;
const USER_AGENT = 'Mozilla/5.0 (compatible; VeryDirtyRSS/1.0; +https://github.com/verydirtyrss)';

// Helper function to resolve relative URLs
function resolveUrl(url: string, base: string): string {
  try {
    return new URL(url, base).href;
  } catch {
    return url;
  }
}

// Helper function to extract text content safely
function extractText(element: cheerio.Cheerio<any>, selector: string): string {
  if (!element.length) return '';
  
  const target = selector ? element.find(selector).first() : element;
  return target.text().trim();
}

// Helper function to extract href or src attributes
function extractLink(element: cheerio.Cheerio<any>, selector: string, siteUrl: string): string {
  if (!element.length) return '';
  
  const target = selector ? element.find(selector).first() : element;
  const href = target.attr('href') || target.attr('src') || '';
  return href ? resolveUrl(href, siteUrl) : '';
}

// Helper function to extract datetime attributes or text
function extractDate(element: cheerio.Cheerio<any>, selector: string): Date | null {
  if (!element.length) return null;
  
  const target = selector ? element.find(selector).first() : element;
  const datetime = target.attr('datetime') || target.text().trim();
  
  if (!datetime) return null;
  
  const date = new Date(datetime);
  return isNaN(date.getTime()) ? null : date;
}

// Helper function to locate the previous page URL from the current page
function extractPreviousPageUrl($: cheerio.CheerioAPI, selector: string, currentPageUrl: string): string {
  if (!selector) return '';

  const target = $(selector).first();
  if (!target.length) return '';

  const href = target.attr('href') || target.find('a').first().attr('href') || '';
  return href ? resolveUrl(href, currentPageUrl) : '';
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

      const response = await axios.get(currentPageUrl, {
        headers: {
          'User-Agent': USER_AGENT,
        },
        timeout: 10000,
      });

      const $ = cheerio.load(response.data);

      if (!feed) {
        const siteTitle = $('title').text().trim() || $('h1').first().text().trim() || 'RSS Feed';
        const siteDescription = $('meta[name="description"]').attr('content') ||
          $('meta[property="og:description"]').attr('content') ||
          'Generated RSS feed from HTML page';

        feed = new RSS({
          title: siteTitle,
          description: siteDescription,
          feed_url: `${req.protocol}://${req.get('host')}${req.originalUrl}`,
          site_url: siteUrl,
          language: $('html').attr('lang') || 'en',
          pubDate: new Date(),
          generator: 'VeryDirtyRSS'
        });
      }

      const items = $(itemSelector);
      console.log(`Found ${items.length} items using selector: ${itemSelector} on page ${pageNumber}`);

      for (let i = 0; i < items.length; i++) {
        const item = items.eq(i);
      
      // Extract basic item data
      const title = extractText(item, titleSelector);
      const description = extractText(item, descriptionSelector);
      const link = extractLink(item, linkSelector, siteUrl);
      const creator = extractText(item, creatorSelector);
      const pubDate = extractDate(item, pubDateSelector);
      const modifiedDate = extractDate(item, modifiedSelector);
      const imageUrl = extractLink(item, imageSelector, siteUrl);
      
      if (!title && !description) continue; // Skip items without content
      
      let content = description;
      
      // If we have a link and contentSelector is specified, try to fetch full content
        if (link && contentSelector && searchParams.fetchContent === 'true') {
        try {
          const articleResponse = await axios.get(link, {
            headers: {
              'User-Agent': USER_AGENT,
            },
            timeout: 5000,
          });
          const article$ = cheerio.load(articleResponse.data);
          const fullContent = article$(contentSelector).html();
          if (fullContent) {
            content = fullContent;
          }
        } catch (error) {
          console.warn(`Failed to fetch full content for: ${link}`);
        }
      }
      
      // Add item to RSS feed
        feed.item({
          title: title || 'Untitled',
          description: content || description || 'No description available',
          url: link || siteUrl,
          author: creator || undefined,
          date: pubDate || modifiedDate || new Date(),
          enclosure: imageUrl ? { url: imageUrl } : undefined,
        });
      }

      if (!previousSelector) {
        break;
      }

      const previousPageUrl = extractPreviousPageUrl($, previousSelector, currentPageUrl);
      if (!previousPageUrl) {
        console.log(`No previous page found with selector: ${previousSelector}`);
        break;
      }

      currentPageUrl = previousPageUrl;
    }

    if (!feed) {
      throw new Error('Unable to initialize RSS feed from target page');
    }
    
    // Return RSS XML
    res.set('Content-Type', 'application/rss+xml; charset=utf-8');
    res.send(feed.xml({ indent: true }));
    
  } catch (error) {
    console.error('Error generating RSS feed:', error);
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

// Documentation endpoint
app.get('/', (_req, res) => {
  res.json({
    name: 'VeryDirtyRSS',
    description: 'Transform any HTML page into an RSS feed',
    version: '1.0.0',
    endpoints: {
      '/rss': {
        method: 'GET',
        description: 'Generate RSS feed from HTML page',
        parameters: {
          url: 'Target URL to scrape (default: https://install.doctor/blog)',
          item: 'CSS selector for post items (default: .post)',
          title: 'CSS selector for post titles (default: .post-title)',
          description: 'CSS selector for post descriptions (default: .paragraph-intro)',
          link: 'CSS selector for post links (default: .post-link)',
          pubDate: 'CSS selector for publish dates (default: .publish-date time)',
          image: 'CSS selector for featured images (default: .featured-image)',
          modified: 'CSS selector for modified dates (default: .modified-date time)',
          content: 'CSS selector for full content (default: .post-content)',
          creator: 'CSS selector for authors (default: .author-date a)',
          previous: 'CSS selector for previous entries link/button (default: disabled)',
          fetchContent: 'Set to "true" to fetch full article content (default: false)'
        },
        example: '/rss?url=https://example.com/blog&item=.article&title=h2&description=.excerpt&previous=.pagination .prev a'
      }
    }
  });
});

app.listen(PORT, () => {
  console.log(`VeryDirtyRSS server running on port ${PORT}`);
  console.log(`Visit http://localhost:${PORT} for documentation`);
});