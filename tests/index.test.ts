import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import axios from 'axios';
import { FileCache } from '../src/cache.js';
import { app, createFetchHtmlWithCache } from '../src/index.js';
import { logger } from '../src/logger.js';

vi.mock('axios', () => ({
  default: {
    get: vi.fn(),
  },
}));

const mockedAxios = vi.mocked(axios, true);

describe('createFetchHtmlWithCache', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns cached HTML without calling axios', async () => {
    const cache = {
      get: vi.fn().mockResolvedValue('<html>cached</html>'),
      set: vi.fn(),
    } as unknown as FileCache;

    const fetchHtml = createFetchHtmlWithCache(cache);
    const html = await fetchHtml('https://example.com/blog', 10000);

    expect(html).toBe('<html>cached</html>');
    expect(cache.get).toHaveBeenCalledWith('GET:https://example.com/blog');
    expect(mockedAxios.get).not.toHaveBeenCalled();
  });

  it('fetches with axios and stores the result on cache miss', async () => {
    const cache = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(undefined),
    } as unknown as FileCache;
    mockedAxios.get.mockResolvedValue({ data: '<html>fresh</html>' } as never);

    const fetchHtml = createFetchHtmlWithCache(cache);
    const html = await fetchHtml('https://example.com/blog', 3210);

    expect(html).toBe('<html>fresh</html>');
    expect(mockedAxios.get).toHaveBeenCalledWith('https://example.com/blog', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; VeryDirtyRSS/1.0; +https://github.com/verydirtyrss)',
      },
      timeout: 3210,
    });
    expect(cache.set).toHaveBeenCalledWith('GET:https://example.com/blog', '<html>fresh</html>');
  });
});

describe('app endpoints', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns health status', async () => {
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
    expect(typeof response.body.timestamp).toBe('string');
  });

  it('returns API documentation', async () => {
    const response = await request(app).get('/');

    expect(response.status).toBe(200);
    expect(response.body.name).toBe('VeryDirtyRSS');
    expect(response.body.endpoints['/rss'].parameters.previous).toContain('previous entries');
    expect(response.body.endpoints['/rss'].parameters.cacheTtlSeconds).toContain('TTL');
  });

  it('returns RSS XML for a successful scrape', async () => {
    mockedAxios.get.mockResolvedValue({
      data: `
        <html><head><title>Blog</title></head><body>
          <article class="post"><h2 class="post-title">Post 1</h2><p class="paragraph-intro">Summary</p><a class="post-link" href="/p1">Read</a><div class="author-date"><a>Author</a></div><div class="publish-date"><time datetime="2024-01-01"></time></div></article>
        </body></html>
      `,
    } as never);

    const response = await request(app).get('/rss').query({ url: 'https://example.com/blog', cache: 'false' });

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('application/rss+xml');
    expect(response.text).toContain('<title><![CDATA[Post 1]]></title>');
    expect(response.text).toContain('<dc:creator><![CDATA[Author]]></dc:creator>');
  });

  it('returns 500 JSON when scraping fails', async () => {
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => undefined);
    mockedAxios.get.mockRejectedValue(new Error('upstream failed'));

    const response = await request(app).get('/rss').query({ url: 'https://example.com/blog', cache: 'false' });

    expect(response.status).toBe(500);
    expect(response.body.error).toBe('Failed to generate RSS feed');
    expect(response.body.message).toBe('upstream failed');
    expect(errorSpy).toHaveBeenCalled();
  });

  it('returns RSS XML from JSON source', async () => {
    const mockJson = {
      title: 'API Feed',
      description: 'Activities from the API',
      data: [
        { id: 1, name: 'Activity 1', summary: 'First activity', url: 'https://example.com/act/1', date: '2024-01-01', author: 'Alice' },
        { id: 2, name: 'Activity 2', summary: 'Second activity', url: 'https://example.com/act/2', date: '2024-01-02', author: 'Bob' },
      ],
    };

    mockedAxios.get.mockResolvedValue({ data: mockJson } as never);

    const response = await request(app)
      .get('/rss')
      .query({
        url: 'https://api.example.com/activities',
        source: 'json',
        item: 'data',
        title: 'name',
        description: 'summary',
        link: 'url',
        pubDate: 'date',
        creator: 'author',
        cache: 'false',
      });

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('application/rss+xml');
    expect(response.text).toContain('<title><![CDATA[Activity 1]]></title>');
    expect(response.text).toContain('<title><![CDATA[Activity 2]]></title>');
    expect(response.text).toContain('<description><![CDATA[First activity]]></description>');
    expect(response.text).toContain('<dc:creator><![CDATA[Alice]]></dc:creator>');
    expect(response.text).toContain('<link>https://example.com/act/1</link>');
    expect(response.text).toContain('<title><![CDATA[API Feed]]></title>'); // auto-detected from root
  });

  it('uses feedTitle query parameter override', async () => {
    mockedAxios.get.mockResolvedValue({
      data: {
        title: 'Ignored API Title',
        data: [{ name: 'Item', summary: 'Desc' }],
      },
    } as never);

    const response = await request(app)
      .get('/rss')
      .query({
        url: 'https://api.example.com/activities',
        source: 'json',
        item: 'data',
        title: 'name',
        description: 'summary',
        feedTitle: 'My Custom RSS',
        feedDescription: 'My custom description',
        cache: 'false',
      });

    expect(response.status).toBe(200);
    expect(response.text).toContain('<title><![CDATA[My Custom RSS]]></title>');
    expect(response.text).toContain('<description><![CDATA[My custom description]]></description>');
    expect(response.text).not.toContain('Ignored API Title');
  });
});
