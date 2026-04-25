import { describe, expect, it, vi } from 'vitest';
import {
  extractDate,
  extractLink,
  extractPreviousPageUrl,
  extractText,
  generateRssXml,
  resolveUrl,
  type FeedGenerationParams,
} from '../src/rss.js';
import * as cheerio from 'cheerio';

const baseParams: FeedGenerationParams = {
  targetUrl: new URL('https://example.com/blog'),
  siteUrl: 'https://example.com',
  selectors: {
    itemSelector: '.post',
    titleSelector: '.title',
    descriptionSelector: '.description',
    linkSelector: 'a.read-more',
    pubDateSelector: 'time',
    imageSelector: 'img',
    modifiedSelector: '.modified time',
    contentSelector: '.content',
    creatorSelector: '.author',
    previousSelector: '.previous',
  },
  fetchContent: false,
  feedUrl: 'http://localhost:3000/rss?url=https://example.com/blog',
};

describe('extractPreviousPageUrl', () => {
  it('returns empty string when selector does not match', () => {
    const $ = cheerio.load('<html><body><div>No pagination</div></body></html>');
    expect(extractPreviousPageUrl($, '.previous', 'https://example.com/blog')).toBe('');
  });

  it('resolves relative previous links against current page', () => {
    const $ = cheerio.load('<a class="previous" href="/blog/page/2">Previous</a>');
    expect(extractPreviousPageUrl($, '.previous', 'https://example.com/blog/page/1')).toBe('https://example.com/blog/page/2');
  });
});

describe('helpers', () => {
  it('resolveUrl returns absolute URL and preserves invalid values', () => {
    expect(resolveUrl('/post-1', 'https://example.com/blog')).toBe('https://example.com/post-1');
    expect(resolveUrl('not a url%', 'https://example.com/blog')).toBe('https://example.com/not%20a%20url%');
    expect(resolveUrl('https://[invalid', 'https://example.com/blog')).toBe('https://[invalid');
  });

  it('extractText returns nested text or empty string when missing', () => {
    const $ = cheerio.load('<article><h2 class="title">Hello</h2><p>Fallback</p></article>');
    const article = $('article');

    expect(extractText(article, '.title')).toBe('Hello');
    expect(extractText(article, '.missing')).toBe('');
    expect(extractText(article, '')).toContain('Hello');
  });

  it('extractLink reads href and src attributes and resolves relative URLs', () => {
    const $ = cheerio.load('<article><a class="read-more" href="/post-1">Read</a><img class="hero" src="/hero.jpg"></article>');
    const article = $('article');

    expect(extractLink(article, '.read-more', 'https://example.com')).toBe('https://example.com/post-1');
    expect(extractLink(article, '.hero', 'https://example.com')).toBe('https://example.com/hero.jpg');
    expect(extractLink(article, '.missing', 'https://example.com')).toBe('');
  });

  it('extractDate handles datetime attributes, text nodes, and invalid values', () => {
    const $ = cheerio.load(`
      <article>
        <time class="published" datetime="2024-01-01T00:00:00Z"></time>
        <span class="updated">2024-01-02</span>
        <span class="invalid">not-a-date</span>
      </article>
    `);
    const article = $('article');

    expect(extractDate(article, '.published')?.toISOString()).toBe('2024-01-01T00:00:00.000Z');
    expect(extractDate(article, '.updated')?.toISOString()).toBe('2024-01-02T00:00:00.000Z');
    expect(extractDate(article, '.invalid')).toBeNull();
    expect(extractDate(article, '.missing')).toBeNull();
  });
});

describe('generateRssXml', () => {
  it('crawls previous pages recursively until pagination stops', async () => {
    const pages: Record<string, string> = {
      'https://example.com/blog': `
        <html><head><title>Example Blog</title></head><body>
          <article class="post"><h2 class="title">Post 1</h2><p class="description">D1</p><a class="read-more" href="/p1">Read</a><time datetime="2024-01-01"></time></article>
          <nav><a class="previous" href="/blog/page/2">Previous</a></nav>
        </body></html>
      `,
      'https://example.com/blog/page/2': `
        <html><body>
          <article class="post"><h2 class="title">Post 2</h2><p class="description">D2</p><a class="read-more" href="/p2">Read</a><time datetime="2024-01-02"></time></article>
          <nav><a class="previous" href="/blog/page/3">Previous</a></nav>
        </body></html>
      `,
      'https://example.com/blog/page/3': `
        <html><body>
          <article class="post"><h2 class="title">Post 3</h2><p class="description">D3</p><a class="read-more" href="/p3">Read</a><time datetime="2024-01-03"></time></article>
        </body></html>
      `,
    };

    const fetchHtml = vi.fn(async (url: string) => {
      const html = pages[url];
      if (!html) throw new Error(`Not found: ${url}`);
      return html;
    });

    const xml = await generateRssXml(baseParams, fetchHtml);

    expect(fetchHtml).toHaveBeenCalledTimes(3);
    expect(fetchHtml).toHaveBeenCalledWith('https://example.com/blog', 10000);
    expect(fetchHtml).toHaveBeenCalledWith('https://example.com/blog/page/2', 10000);
    expect(fetchHtml).toHaveBeenCalledWith('https://example.com/blog/page/3', 10000);
    expect(xml).toContain('<title><![CDATA[Post 1]]></title>');
    expect(xml).toContain('<title><![CDATA[Post 2]]></title>');
    expect(xml).toContain('<title><![CDATA[Post 3]]></title>');
  });

  it('stops when previous selector is empty', async () => {
    const params: FeedGenerationParams = {
      ...baseParams,
      selectors: {
        ...baseParams.selectors,
        previousSelector: '',
      },
    };

    const fetchHtml = vi.fn(async () => `
      <html><body>
        <article class="post"><h2 class="title">Only Page</h2><p class="description">D</p><a class="read-more" href="/p1">Read</a><time datetime="2024-01-01"></time></article>
        <nav><a class="previous" href="/blog/page/2">Previous</a></nav>
      </body></html>
    `);

    const xml = await generateRssXml(params, fetchHtml);

    expect(fetchHtml).toHaveBeenCalledTimes(1);
    expect(xml).toContain('<title><![CDATA[Only Page]]></title>');
  });

  it('breaks pagination loop when previous page points to an already visited URL', async () => {
    const fetchHtml = vi.fn(async (url: string) => {
      if (url === 'https://example.com/blog') {
        return `
          <html><body>
            <article class="post"><h2 class="title">Post A</h2><p class="description">D</p><a class="read-more" href="/a">Read</a><time datetime="2024-01-01"></time></article>
            <a class="previous" href="/blog/page/2">Previous</a>
          </body></html>
        `;
      }

      return `
        <html><body>
          <article class="post"><h2 class="title">Post B</h2><p class="description">D</p><a class="read-more" href="/b">Read</a><time datetime="2024-01-02"></time></article>
          <a class="previous" href="/blog">Previous</a>
        </body></html>
      `;
    });

    const xml = await generateRssXml(baseParams, fetchHtml);

    expect(fetchHtml).toHaveBeenCalledTimes(2);
    expect(xml).toContain('<title><![CDATA[Post A]]></title>');
    expect(xml).toContain('<title><![CDATA[Post B]]></title>');
  });

  it('fetches and uses full article content when enabled', async () => {
    const params: FeedGenerationParams = {
      ...baseParams,
      fetchContent: true,
      selectors: {
        ...baseParams.selectors,
        previousSelector: '',
      },
    };

    const fetchHtml = vi.fn(async (url: string) => {
      if (url === 'https://example.com/blog') {
        return `
          <html><head><title>Example Blog</title></head><body>
            <article class="post"><h2 class="title">Post 1</h2><p class="description">Summary</p><a class="read-more" href="/p1">Read</a><time datetime="2024-01-01"></time></article>
          </body></html>
        `;
      }

      return '<html><body><div class="content"><p>Full article body</p></div></body></html>';
    });

    const xml = await generateRssXml(params, fetchHtml);

    expect(fetchHtml).toHaveBeenCalledWith('https://example.com/blog', 10000);
    expect(fetchHtml).toHaveBeenCalledWith('https://example.com/p1', 5000);
    expect(xml).toContain('<p>Full article body</p>');
  });

  it('falls back to the summary when full article fetch fails', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const params: FeedGenerationParams = {
      ...baseParams,
      fetchContent: true,
      selectors: {
        ...baseParams.selectors,
        previousSelector: '',
      },
    };

    const fetchHtml = vi.fn(async (url: string) => {
      if (url === 'https://example.com/blog') {
        return `
          <html><body>
            <article class="post"><h2 class="title">Post 1</h2><p class="description">Summary</p><a class="read-more" href="/p1">Read</a><time datetime="2024-01-01"></time></article>
          </body></html>
        `;
      }

      throw new Error('network failure');
    });

    const xml = await generateRssXml(params, fetchHtml);

    expect(warnSpy).toHaveBeenCalledWith('Failed to fetch full content for: https://example.com/p1');
    expect(xml).toContain('<description><![CDATA[Summary]]></description>');
  });

  it('uses page metadata for feed title and description', async () => {
    const fetchHtml = vi.fn(async () => `
      <html lang="es">
        <head>
          <title>Site Title</title>
          <meta name="description" content="Site Description">
        </head>
        <body>
          <article class="post"><h2 class="title">Post 1</h2><p class="description">Summary</p><a class="read-more" href="/p1">Read</a><time datetime="2024-01-01"></time></article>
        </body>
      </html>
    `);

    const xml = await generateRssXml({
      ...baseParams,
      selectors: {
        ...baseParams.selectors,
        previousSelector: '',
      },
    }, fetchHtml);

    expect(xml).toContain('<title><![CDATA[Site Title]]></title>');
    expect(xml).toContain('<description><![CDATA[Site Description]]></description>');
    expect(xml).toContain('<language><![CDATA[es]]></language>');
  });
});
