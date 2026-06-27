import { describe, expect, it, vi } from 'vitest';
import {
  extractDate,
  extractLink,
  extractPreviousPageUrl,
  extractText,
  generateRssXml,
  generateRssXmlFromJson,
  getJsonArray,
  getJsonDate,
  getJsonLink,
  getJsonString,
  resolveJsonPath,
  resolveUrl,
  type FeedGenerationParams,
} from '../src/rss.js';
import { logger } from '../src/logger.js';
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
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
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

    expect(warnSpy).toHaveBeenCalledWith('Failed to fetch full content for: %s', 'https://example.com/p1');
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

  it('uses feedTitle and feedDescription overrides in HTML mode', async () => {
    const fetchHtml = vi.fn(async () => `
      <html><head><title>Ignored Title</title></head><body>
        <article class="post"><h2 class="title">Post 1</h2><p class="description">Summary</p><a class="read-more" href="/p1">Read</a><time datetime="2024-01-01"></time></article>
      </body></html>
    `);

    const xml = await generateRssXml({
      ...baseParams,
      feedTitle: 'HTML Override Title',
      feedDescription: 'HTML Override Description',
      selectors: {
        ...baseParams.selectors,
        previousSelector: '',
      },
    }, fetchHtml);

    expect(xml).toContain('<title><![CDATA[HTML Override Title]]></title>');
    expect(xml).toContain('<description><![CDATA[HTML Override Description]]></description>');
    expect(xml).not.toContain('Ignored Title');
  });
});

// ── JSON Helpers ───────────────────────────────────────────────

describe('resolveJsonPath', () => {
  const obj = {
    title: 'Feed Title',
    data: [
      { id: 1, name: 'Item 1', info: { url: '/a' }, tags: ['x', 'y'] },
      { id: 2, name: 'Item 2', info: { url: '/b' } },
    ],
    meta: { count: 2, next: '/page/2' },
  };

  it('resolves top-level fields', () => {
    expect(resolveJsonPath(obj, 'title')).toBe('Feed Title');
    expect(resolveJsonPath(obj, 'meta.count')).toBe(2);
  });

  it('resolves $.-prefixed paths', () => {
    expect(resolveJsonPath(obj, '$.title')).toBe('Feed Title');
    expect(resolveJsonPath(obj, '$.meta.count')).toBe(2);
  });

  it('resolves array indexing', () => {
    expect(resolveJsonPath(obj, 'data[0].name')).toBe('Item 1');
    expect(resolveJsonPath(obj, 'data[1].id')).toBe(2);
  });

  it('resolves array wildcard (returns the array)', () => {
    const result = resolveJsonPath(obj, 'data[*].name');
    expect(result).toBeUndefined(); // wildcard returns array, not deeper
  });

  it('returns undefined for missing fields', () => {
    expect(resolveJsonPath(obj, 'does.not.exist')).toBeUndefined();
    expect(resolveJsonPath(obj, '')).toBeUndefined();
  });

  it('returns undefined for null/undefined input', () => {
    expect(resolveJsonPath(null, 'foo')).toBeUndefined();
    expect(resolveJsonPath(undefined, 'foo')).toBeUndefined();
  });
});

describe('getJsonArray', () => {
  it('returns the array at the given path', () => {
    const data = { items: [{ x: 1 }, { x: 2 }] };
    expect(getJsonArray(data, 'items')).toEqual([{ x: 1 }, { x: 2 }]);
  });

  it('returns empty array when path does not point to an array', () => {
    const data = { items: 'not-an-array' };
    expect(getJsonArray(data, 'items')).toEqual([]);
  });

  it('returns empty array when path is missing', () => {
    const data = { items: [{ x: 1 }] };
    expect(getJsonArray(data, 'missing')).toEqual([]);
  });
});

describe('getJsonString', () => {
  it('returns string values', () => {
    expect(getJsonString({ title: 'Hello' }, 'title')).toBe('Hello');
  });

  it('coerces numbers and booleans', () => {
    expect(getJsonString({ count: 42 }, 'count')).toBe('42');
    expect(getJsonString({ active: true }, 'active')).toBe('true');
  });

  it('returns empty string for missing selectors or undefined values', () => {
    expect(getJsonString({ title: 'Hello' }, '')).toBe('');
    expect(getJsonString({ title: 'Hello' }, 'missing')).toBe('');
  });

  it('returns empty string for non-coercible types (objects)', () => {
    expect(getJsonString({ nested: { a: 1 } }, 'nested')).toBe('');
  });
});

describe('getJsonDate', () => {
  it('parses ISO date strings', () => {
    const result = getJsonDate({ date: '2024-01-01T00:00:00Z' }, 'date');
    expect(result?.toISOString()).toBe('2024-01-01T00:00:00.000Z');
  });

  it('returns null for empty or invalid selectors', () => {
    expect(getJsonDate({ date: '2024-01-01' }, '')).toBeNull();
    expect(getJsonDate({ date: 'not-a-date' }, 'date')).toBeNull();
    expect(getJsonDate({ date: '2024-01-01' }, 'missing')).toBeNull();
  });

  it('coerces numeric timestamps', () => {
    const ts = 1704067200000; // 2024-01-01T00:00:00.000Z
    const result = getJsonDate({ ts }, 'ts');
    expect(result?.toISOString()).toBe('2024-01-01T00:00:00.000Z');
  });
});

describe('getJsonLink', () => {
  it('extracts a link and resolves relative URLs', () => {
    expect(getJsonLink({ url: '/post/1' }, 'url', 'https://example.com')).toBe('https://example.com/post/1');
  });

  it('preserves absolute URLs', () => {
    expect(getJsonLink({ url: 'https://other.com/page' }, 'url', 'https://example.com')).toBe('https://other.com/page');
  });

  it('returns empty string for missing selector or value', () => {
    expect(getJsonLink({ url: 'https://x.com' }, '', 'https://example.com')).toBe('');
    expect(getJsonLink({ url: null }, 'url', 'https://example.com')).toBe('');
  });
});

describe('generateRssXmlFromJson', () => {
  const jsonParams: FeedGenerationParams = {
    targetUrl: new URL('https://api.example.com/activities'),
    siteUrl: 'https://example.com',
    selectors: {
      itemSelector: '', titleSelector: '', descriptionSelector: '',
      linkSelector: '', pubDateSelector: '', imageSelector: '',
      modifiedSelector: '', contentSelector: '', creatorSelector: '',
      previousSelector: '',
    },
    fetchContent: false,
    feedUrl: 'http://localhost:3000/rss?url=https://api.example.com/activities&source=json',
    sourceType: 'json',
    jsonSelectors: {
      itemSelector: 'data',
      titleSelector: 'name',
      descriptionSelector: 'summary',
      linkSelector: 'url',
      pubDateSelector: 'date',
      imageSelector: 'image',
      modifiedSelector: '',
      contentSelector: '',
      creatorSelector: 'author',
    },
  };

  it('parses JSON array and generates RSS items', async () => {
    const mockJson = {
      title: 'Activities Feed',
      description: 'Latest activities',
      data: [
        { id: 1, name: 'Activity 1', summary: 'First activity', url: '/act/1', date: '2024-01-01', author: 'Alice', image: '/img/1.jpg' },
        { id: 2, name: 'Activity 2', summary: 'Second activity', url: '/act/2', date: '2024-01-02', author: 'Bob' },
      ],
    };

    const fetchJson = vi.fn(async () => mockJson);
    const xml = await generateRssXmlFromJson(jsonParams, fetchJson);

    expect(fetchJson).toHaveBeenCalledOnce();
    expect(xml).toContain('<title><![CDATA[Activity 1]]></title>');
    expect(xml).toContain('<title><![CDATA[Activity 2]]></title>');
    expect(xml).toContain('<description><![CDATA[First activity]]></description>');
    expect(xml).toContain('<dc:creator><![CDATA[Alice]]></dc:creator>');
    expect(xml).toContain('<link>https://example.com/act/1</link>');
    expect(xml).toContain('<link>https://example.com/act/2</link>');
    expect(xml).toContain('/img/1.jpg'); // enclosure URL from image selector
  });

  it('uses feed metadata from JSON root', async () => {
    const fetchJson = vi.fn(async () => ({
      title: 'API Feed',
      description: 'From the API root',
      data: [{ name: 'Item', summary: 'Desc' }],
    }));

    const xml = await generateRssXmlFromJson(jsonParams, fetchJson);

    expect(xml).toContain('<title><![CDATA[API Feed]]></title>');
    expect(xml).toContain('<description><![CDATA[From the API root]]></description>');
  });

  it('skips items missing both title and description', async () => {
    const fetchJson = vi.fn(async () => ({
      data: [
        { name: 'Visible', summary: 'Has both' },
        { name: 'NoDesc' },       // has title, so included
        { summary: 'NoTitle' },   // has description, so included
        { irrelevant: 'skip' },   // no title or description → skipped
      ],
    }));

    const xml = await generateRssXmlFromJson(jsonParams, fetchJson);

    expect(xml).toContain('Visible');
    expect(xml).toContain('NoDesc');
    expect(xml).toContain('NoTitle');
    expect(xml).not.toContain('irrelevant');
  });

  it('throws when jsonSelectors is missing', async () => {
    const badParams: FeedGenerationParams = {
      ...jsonParams,
      jsonSelectors: undefined,
    };

    await expect(generateRssXmlFromJson(badParams, vi.fn()))
      .rejects.toThrow('jsonSelectors are required for JSON source type');
  });

  it('throws when JSON response is null or undefined', async () => {
    const fetchJson = vi.fn(async () => null);
    await expect(generateRssXmlFromJson(jsonParams, fetchJson))
      .rejects.toThrow('JSON source returned empty response');
  });

  it('uses feedTitle and feedDescription overrides when provided', async () => {
    const fetchJson = vi.fn(async () => ({
      data: [{ name: 'Item', summary: 'Desc' }],
    }));

    const xml = await generateRssXmlFromJson({
      ...jsonParams,
      feedTitle: 'My Custom Feed',
      feedDescription: 'My custom description',
    }, fetchJson);

    expect(xml).toContain('<title><![CDATA[My Custom Feed]]></title>');
    expect(xml).toContain('<description><![CDATA[My custom description]]></description>');
  });
});
