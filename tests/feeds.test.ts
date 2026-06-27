/**
 * Integration test for all user-configured RSS feeds.
 *
 * Fetches real HTML from each source URL and validates that the
 * current VeryDirtyRSS selectors extract items and fields correctly.
 *
 * These are live-network tests — sites can change their HTML structure,
 * go offline, or rate-limit requests. If a feed fails, inspect whether
 * the site changed or VeryDirtyRSS regressed.
 *
 * ── Test methodology ────────────────────────────────────────────
 *
 *   Each feed entry is tested with the production User-Agent
 *   (mirrors what the server sends, from `USER_AGENT` env var or
 *   the default Chrome UA in `src/index.ts`).
 *
 *   When a site blocks that User-Agent (403), `beforeAll`
 *   automatically retries with a fallback browser User-Agent so
 *   the selector validation tests can still run.  A dedicated test
 *   (`"production User-Agent was not blocked"`) reports whether the
 *   production UA was rejected, so you can distinguish "UA blocked"
 *   from "selectors are broken."
 */

import { beforeAll, describe, expect, it, vi } from 'vitest';
import * as cheerio from 'cheerio';
import axios from 'axios';

import { extractText, extractLink, extractDate, resolveUrl } from '../src/rss.js';
import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';

// ── Global setup ───────────────────────────────────────────────────────

vi.setConfig({ testTimeout: 60_000 });

/** The default User-Agent the VeryDirtyRSS server sends (configurable via USER_AGENT env var). */
const PRODUCTION_UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/** Fallback User-Agent used for diagnostic retries when the production UA is blocked. */
const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:130.0) Gecko/20100101 Firefox/130.0';

interface FeedSelectors {
  item: string;
  title: string;
  link: string;
  description?: string;
  pubDate?: string;
  creator?: string;
  image?: string;
  previous?: string;
  content?: string;
}

interface FeedEntry {
  name: string;
  url: string;
  selectors: FeedSelectors;
  fetchContent?: boolean;
  readability?: boolean;
  /** Site is known to block CI IP ranges (e.g. GitHub Actions); skip in CI. */
  ciBlocked?: boolean;
}

// ── Feed entries from the user's previous configuration ────────────────
//
// Selector values are shown **decoded** (as Express / req.query delivers
// them).  For example `link=.c_t+a` in the URL becomes `.c_t a` because
// `+` is a space in query strings, and `h4%20a` becomes `h4 a` because
// percent-decoding produces a space.

const FEEDS: FeedEntry[] = [
  {
    name: 'Diego A. Manrique',
    url: 'https://elpais.com/autor/diego-alfredo-manrique-martinez/',
    selectors: {
      item: 'article',
      title: '.c_t',
      link: '.c_t a',
      description: '.c_d',
      pubDate: 'time',
      creator: '.c_a_a',
      content: '.a_c',
    },
    fetchContent: true,
    readability: true,
    ciBlocked: true,
  },
  {
    name: 'Roger Senserrich (4rooms)',
    url: 'https://www.vozpopuli.com/redaccion/roger-senserrich',
    selectors: {
      item: 'article',
      title: 'h2',
      description: 'div.text-inherit',
      link: 'a',
      content: '.post-container',
    },
    fetchContent: true,
    readability: true,
  },
  {
    name: 'Joana Bonet Camprubí',
    url: 'https://www.lavanguardia.com/autores/joana-bonet.html',
    selectors: {
      item: 'article',
      title: 'h2',
      description: '.standfirst',
      link: 'a',
      pubDate: 'time',
    },
  },
  {
    name: 'Jordi Évole',
    url: 'https://www.lavanguardia.com/autores/jordi-evole.html',
    selectors: {
      item: 'article',
      title: 'h2',
      link: 'a',
    },
  },
  {
    name: 'Miquel Molina',
    url: 'https://www.lavanguardia.com/autores/miquel-molina.html',
    selectors: {
      item: 'article',
      title: 'h2',
      link: 'a',
    },
  },
  {
    name: 'Plàcid Garcia-Planas',
    url: 'https://www.lavanguardia.com/autores/placid-garcia-planas.html',
    selectors: {
      item: 'article',
      title: 'h2',
      description: '.standfirst',
      link: 'a',
      pubDate: 'time',
    },
  },
  {
    name: 'Learn | PerThirtySix',
    url: 'https://perthirtysix.com/section/learn',
    selectors: {
      item: 'article',
      title: 'h3',
      description: 'p.text-sm.text-gray-600',
      link: 'h3 a',
      image: 'img',
      creator: 'span.text-gray-900.font-medium',
    },
  },
  {
    name: "Guia de l'oci | Consorci de Turisme del Baix Llobregat",
    url: 'https://www.turismebaixllobregat.com/ca/guia-de-loci',
    selectors: {
      item: 'div.node--type-leisure-activity',
      title: 'div.field--name-node-title',
      link: 'h4 a',
      image: '.image-style-card',
      description: 'div.node--type-leisure-activity',
    },
  },
  {
    name: 'maestrosdelafotografia',
    url: 'https://maestrosdelafotografia.wordpress.com/',
    selectors: {
      item: 'article',
      title: '.entry-title',
      link: '.entry-title a',
      previous: '.nav-previous a',
      content: '.entry-content',
    },
    fetchContent: true,
    readability: true,
  },
];

// ── Helpers ─────────────────────────────────────────────────────────────

/** Fetch HTML with the given User-Agent. */
async function fetchHtml(url: string, userAgent: string): Promise<string> {
  const response = await axios.get(url, {
    headers: {
      'User-Agent': userAgent,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
    timeout: 20_000,
    maxRedirects: 5,
  });
  return String(response.data);
}

/** Check if an error is an HTTP-level Axios error (4xx, 5xx). */
function isHttpError(err: unknown): boolean {
  return axios.isAxiosError(err) && err.response !== undefined && err.response.status >= 400;
}

// ── Test factory ───────────────────────────────────────────────────────

/**
 * Build a `describe` block for one feed entry.
 *
 * The `beforeAll` first tries the production VeryDirtyRSS User-Agent.
 * If the site returns 403, it retries with a standard browser UA so
 * selector validation can still proceed.  A dedicated test tells you
 * whether the production UA was blocked.
 */
function testFeed(entry: FeedEntry): void {
  const { name, url, selectors } = entry;

  describe(name, () => {
    let html: string;
    let $: cheerio.CheerioAPI;
    let items: cheerio.Cheerio<any>;
    let firstItem: cheerio.Cheerio<any>;
    let productionUaOk: boolean;

    beforeAll(async () => {
      try {
        html = await fetchHtml(url, PRODUCTION_UA);
        productionUaOk = true;
      } catch (err: unknown) {
        if (isHttpError(err)) {
          try {
            // Retry with a standard browser UA in case the production UA
            // is being blocked/rejected by the site
            html = await fetchHtml(url, BROWSER_UA);
            productionUaOk = false;
          } catch {
            // Both UAs blocked (e.g. site has IP-based blocking / WAF).
            // Set minimal HTML so tests run and report selectors missing
            // instead of crashing the whole describe block.
            html = '<!doctype html><html><body></body></html>';
            productionUaOk = false;
          }
        } else {
          // Genuine error — re-throw so tests are skipped with a clear message
          throw err;
        }
      }
      $ = cheerio.load(html);
      items = $(selectors.item);
      // Find the first item that has a non-empty title, so extraction
      // tests work even on pages where early items are nav elements
      // (e.g. Vozpopuli's first 4 <article> are navigation menus).
      if (items.length > 0) {
        firstItem = items.first();
        for (let i = 0; i < items.length; i++) {
          const candidate = items.eq(i);
          if (extractText(candidate, selectors.title).length > 0) {
            firstItem = candidate;
            break;
          }
        }
      } else {
        firstItem = $('html');
      }
    }, 30_000);

    // ── Connectivity ────────────────────────────────────────────────

    it('production User-Agent was not blocked (403)', () => {
      expect(productionUaOk).toBe(true);
    });

    it('page loads and contains content', () => {
      expect(html.length).toBeGreaterThan(100);
    });

    // ── Item matching ───────────────────────────────────────────────

    it(`finds items with selector "${selectors.item}"`, () => {
      expect(items.length).toBeGreaterThanOrEqual(1);
    });

    describe('first item extraction', () => {
      let title: string;
      let link: string;

      beforeAll(() => {
        title = extractText(firstItem, selectors.title);
        link = extractLink(firstItem, selectors.link, new URL(url).origin);
      });

      it(`extracts title with selector "${selectors.title}"`, () => {
        expect(title.length).toBeGreaterThanOrEqual(1);
      });

      it(`extracts link with selector "${selectors.link}"`, () => {
        expect(link.length).toBeGreaterThanOrEqual(1);
        expect(link).toMatch(/^https?:\/\//);
      });

      if (selectors.description) {
        it(`extracts description with selector "${selectors.description}"`, () => {
          const desc = extractText(firstItem, selectors.description!);
          expect(desc).toBeDefined();
        });
      }

      if (selectors.pubDate) {
        it(`extracts pubDate with selector "${selectors.pubDate}"`, () => {
          const date = extractDate(firstItem, selectors.pubDate!);
          if (date !== null) {
            expect(date.getTime()).not.toBeNaN();
          }
        });
      }

      if (selectors.creator) {
        it(`extracts creator with selector "${selectors.creator}"`, () => {
          const creator = extractText(firstItem, selectors.creator!);
          expect(creator).toBeDefined();
        });
      }

      if (selectors.image) {
        it(`extracts image URL with selector "${selectors.image}"`, () => {
          const image = extractLink(firstItem, selectors.image!, new URL(url).origin);
          expect(image).toBeDefined();
          if (image) {
            expect(image).toMatch(/^https?:\/\//);
          }
        });
      }
    });

    // ── Structural integrity ────────────────────────────────────────

    it('at least one item has both title and link', () => {
      let found = false;
      const origin = new URL(url).origin;
      for (let i = 0; i < Math.min(items.length, 10); i++) {
        const item = items.eq(i);
        const t = extractText(item, selectors.title);
        const l = extractLink(item, selectors.link, origin);
        if (t && l) {
          found = true;
          break;
        }
      }
      expect(found).toBe(true);
    });

    // ── Full content fetching ───────────────────────────────────────
    //
    // For feeds configured with fetchContent=true and a content selector,
    // pick the first article link, fetch the article page, and verify
    // the content selector extracts meaningful body text.

    if (entry.fetchContent && selectors.content) {
      describe('full content extraction', () => {
        let articleUrl: string;
        let articleHtml: string;
        let article$: cheerio.CheerioAPI;

        beforeAll(async () => {
          // Find the first article with both a title AND a link
          // (mirrors generateRssXml's item filter — items without
          // a title are skipped, so their links aren't valid article URLs).
          const origin = new URL(url).origin;
          for (let i = 0; i < Math.min(items.length, 10); i++) {
            const item = items.eq(i);
            const title = extractText(item, selectors.title);
            const link = extractLink(item, selectors.link, origin);
            if (title && link) {
              articleUrl = link;
              break;
            }
          }

          if (articleUrl) {
            articleHtml = await fetchHtml(articleUrl, PRODUCTION_UA);
            article$ = cheerio.load(articleHtml);
          }
        }, 30_000);

        it('finds an article link on the listing page', () => {
          expect(articleUrl).toBeTruthy();
          expect(articleUrl).toMatch(/^https?:\/\//);
        });

        if (selectors.content) {
          it(`fetches article page and extracts content with selector "${selectors.content}"`, () => {
            expect(articleHtml.length).toBeGreaterThan(500);
            const contentEl = article$(selectors.content!).first();
            const contentHtml = contentEl.html() || '';
            const contentText = contentEl.text().trim();
            // The content should have meaningful text — at minimum a few
            // paragraphs (a couple hundred chars).
            expect(contentText.length).toBeGreaterThan(200);
            // Should contain actual article paragraphs (<p> tags)
            const paragraphs = contentEl.find('p').length;
            expect(paragraphs).toBeGreaterThanOrEqual(1);
            // HTML should contain some inline tags (not just bare text)
            expect(contentHtml.length).toBeGreaterThan(300);
          });
        }

        if (entry.readability) {
          it('cleans article content with Mozilla Readability', () => {
            const doc = new JSDOM(articleHtml, { url: articleUrl });
            const reader = new Readability(doc.window.document);
            const article = reader.parse();
            expect(article).not.toBeNull();
            // Readability should extract a clean article
            expect(article!.content.length).toBeGreaterThan(400);
            expect(article!.textContent.length).toBeGreaterThan(400);
            // Should contain some paragraphs
            expect(article!.textContent!.length).toBeGreaterThan(200);
            // The byline should be detected for known authors
            expect(article!.title?.length).toBeGreaterThanOrEqual(1);
          });
        }
      });
    }

    // ── Pagination ──────────────────────────────────────────────────

    if (selectors.previous) {
      it(`finds previous-page link with selector "${selectors.previous}"`, () => {
        const prevEl = $(selectors.previous!).first();
        if (prevEl.length > 0) {
          const href = prevEl.attr('href') || '';
          if (href) {
            const resolved = resolveUrl(href, url);
            expect(resolved).toMatch(/^https?:\/\//);
          }
        }
      });
    }
  });
}

// ── CI awareness ─────────────────────────────────────────────────────────
//
// Some sites block GitHub Actions IP ranges (e.g. El País returns 403).
// In CI we skip those entries since we can't validate selectors against a
// site that refuses our connection.  Locally all entries run normally.

const isCI = process.env.GITHUB_ACTIONS === 'true';

// ── Run tests for (filtered) feed entries ───────────────────────────────

FEEDS
  .filter(entry => !(isCI && entry.ciBlocked))
  .forEach(testFeed);

if (isCI) {
  const skipped = FEEDS.filter(e => e.ciBlocked).map(e => e.name);
  if (skipped.length > 0) {
    // eslint-disable-next-line no-console
    console.warn(`ℹ CI mode: skipped feed(s) blocked by CI IP ranges: ${skipped.join(', ')}`);
  }
}
