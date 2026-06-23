import { test, expect } from '@playwright/test';

// ── Helpers ──────────────────────────────────────────────────────────────

/** Switch the source type by clicking its label (radio inputs are display:none). */
async function setSource(page, type: 'html' | 'json') {
  const selector = type === 'html' ? 'label[for="sourceHtml"]' : 'label[for="sourceJson"]';
  await page.locator(selector).click();
  await expect(page.locator(`#source${type === 'html' ? 'Html' : 'Json'}`)).toBeChecked();
}

/** Open the "More selectors" <details> panel so its fields are visible. */
async function openMoreSelectors(page) {
  const details = page.locator('details.collapse >> nth=0');
  if (await details.getAttribute('open') !== null) return;
  await details.locator('summary').click();
  await expect(details).toHaveAttribute('open');
}

/** Fill URL + click generate, wait for result section to appear. */
async function generateWithUrl(page, url: string) {
  await page.fill('#url', url);
  await page.click('#generateBtn');
  await page.waitForSelector('#resultSection:not(.hidden)', { timeout: 20000 });
}

/** Assert a field's helper hint text. */
async function expectHint(page, fieldId: string, pattern: RegExp) {
  const hint = page.locator(`#${fieldId}`).locator('..').locator('.field-hint');
  await expect(hint).toBeVisible();
  await expect(hint).toHaveText(pattern);
}

// ── Tests ────────────────────────────────────────────────────────────────

test.describe('Builder page loads', () => {
  test('renders the header and title', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/VeryDirtyRSS.*RSS Feed Builder/);
    await expect(page.locator('h1')).toContainText('VeryDirtyRSS');
    await expect(page.locator('header p')).toContainText('HTML page or JSON API');
  });

  test('shows the source toggle defaulting to HTML', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#sourceHtml')).toBeChecked();
    await expect(page.locator('#sourceJson')).not.toBeChecked();
  });

  test('shows the URL input with correct placeholder', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#url')).toBeVisible();
    await expect(page.locator('#url')).toHaveAttribute('placeholder', 'https://example.com/blog');
  });

  test('shows generate button and hides result section initially', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#generateBtn')).toBeVisible();
    await expect(page.locator('#resultSection')).toHaveClass(/hidden/);
  });

  test('shows the selector fields with correct defaults', async ({ page }) => {
    await page.goto('/');

    const checks = [
      ['#item', '.post'],
      ['#title', '.post-title'],
      ['#description', '.paragraph-intro'],
      ['#link', '.post-link'],
      ['#pubDate', '.publish-date time'],
      ['#image', '.featured-image'],
      ['#modified', '.modified-date time'],
      ['#content', '.post-content'],
      ['#creator', '.author-date a'],
      ['#previous', '.pagination .prev a'],
    ] as const;

    for (const [sel, ph] of checks) {
      await expect(page.locator(sel)).toHaveAttribute('placeholder', ph);
    }
  });

  test('shows the Options section with checkboxes and inputs', async ({ page }) => {
    await page.goto('/');

    // Options details is open by default
    await expect(page.locator('#feedTitle')).toBeVisible();
    await expect(page.locator('#feedDescription')).toBeVisible();
    await expect(page.locator('#cacheTtl')).toBeVisible();
    await expect(page.locator('#fetchContent')).toBeVisible();
    await expect(page.locator('#cache')).toBeVisible();
    await expect(page.locator('#cache')).toBeChecked();
  });
});

test.describe('Source type toggle', () => {
  test('switching to JSON hides Previous field and updates hints', async ({ page }) => {
    await page.goto('/');
    await openMoreSelectors(page);

    // HTML — Previous field is visible
    await expect(page.locator('#previousField')).toBeVisible();
    await expectHint(page, 'item', /CSS selector/i);

    // Switch to JSON
    await setSource(page, 'json');
    await expect(page.locator('#previousField')).toBeHidden();
    await expectHint(page, 'item', /JSON path/i);
    await expectHint(page, 'title', /JSON path/i);
    await expectHint(page, 'link', /JSON path/i);
  });

  test('switching back to HTML shows Previous field again', async ({ page }) => {
    await page.goto('/');
    await openMoreSelectors(page);

    // Switch to JSON first
    await setSource(page, 'json');
    await expect(page.locator('#previousField')).toBeHidden();

    // Switch back to HTML
    await setSource(page, 'html');
    await expect(page.locator('#previousField')).toBeVisible();
    await expectHint(page, 'item', /CSS selector/i);
  });

  test('JSON mode updates placeholder defaults', async ({ page }) => {
    await page.goto('/');
    await setSource(page, 'json');

    await expect(page.locator('#item')).toHaveAttribute('placeholder', 'data');
    await expect(page.locator('#title')).toHaveAttribute('placeholder', 'title');
    await expect(page.locator('#description')).toHaveAttribute('placeholder', 'description');
    await expect(page.locator('#link')).toHaveAttribute('placeholder', 'url');
    await expect(page.locator('#pubDate')).toHaveAttribute('placeholder', 'pubDate');
  });
});

test.describe('Form interaction', () => {
  test('fills all selector fields and reads them back', async ({ page }) => {
    await page.goto('/');
    await openMoreSelectors(page);

    const values: Record<string, string> = {
      url: 'https://example.com/blog',
      item: '.article',
      title: 'h2',
      description: '.excerpt',
      link: 'a.read-more',
      pubDate: 'time',
      image: 'img',
      modified: '.updated',
      content: '.body',
      creator: '.author',
      previous: '.next a',
      feedTitle: 'My Blog',
      feedDescription: 'Blog posts feed',
      cacheTtl: '600',
    };

    for (const [id, val] of Object.entries(values)) {
      await page.fill(`#${id}`, val);
    }

    for (const [id, val] of Object.entries(values)) {
      await expect(page.locator(`#${id}`)).toHaveValue(val);
    }
  });

  test('toggles checkboxes and fills options', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('#cache')).toBeChecked();
    await page.locator('#cache').uncheck();
    await expect(page.locator('#cache')).not.toBeChecked();

    await expect(page.locator('#fetchContent')).not.toBeChecked();
    await page.locator('#fetchContent').check();
    await expect(page.locator('#fetchContent')).toBeChecked();
  });
});

test.describe('Feed generation (HTML mode)', () => {
  test('generate with defaults creates RSS XML and shows result section', async ({ page }) => {
    await page.goto('/');
    await generateWithUrl(page, 'https://example.com');

    await expect(page.locator('#resultSection')).toBeVisible();
    await expect(page.locator('#resultSection')).not.toHaveClass(/hidden/);
    await expect(page.locator('#statusBadge')).toContainText('Generated');

    const feedUrl = page.locator('#feedUrl');
    await expect(feedUrl).toBeVisible();
    const href = await feedUrl.getAttribute('href');
    expect(href).toContain('/rss?url=https%3A%2F%2Fexample.com');

    await expect(page.locator('#openBtn')).toHaveAttribute('href', href);

    const preview = page.locator('#rssPreview');
    await expect(preview).toContainText('<?xml');
    await expect(preview).toContainText('<rss');
    await expect(preview).toContainText('Example Domain');
  });

  test('generates feed with custom selectors and shows correct URL params', async ({ page }) => {
    await page.goto('/');

    await page.fill('#url', 'https://example.com/blog');
    await page.fill('#item', '.article');
    await page.fill('#title', 'h2');
    await page.fill('#description', '.excerpt');
    await page.fill('#link', 'a');
    await page.fill('#feedTitle', 'My Blog');
    await page.fill('#feedDescription', 'Blog posts');

    await page.click('#generateBtn');
    await page.waitForSelector('#resultSection:not(.hidden)', { timeout: 15000 });

    const href = await page.locator('#feedUrl').getAttribute('href');
    expect(href).toContain('url=https%3A%2F%2Fexample.com%2Fblog');
    expect(href).toContain('item=.article');
    expect(href).toContain('title=h2');
    expect(href).toContain('description=.excerpt');
    expect(href).toContain('link=a');
    expect(href).toContain('feedTitle=My+Blog');
    expect(href).toContain('feedDescription=Blog+posts');
  });

  test('shows error message when the URL returns 500', async ({ page }) => {
    await page.goto('/');
    await page.fill('#url', 'https://this-domain-does-not-exist-12345.com');
    await page.click('#generateBtn');

    await page.waitForSelector('#resultSection:not(.hidden)', { timeout: 25000 });
    await expect(page.locator('#errorMessage')).toBeVisible();
    await expect(page.locator('#statusBadge')).toContainText('Error');
  });

  test('Enter key in URL field triggers generation', async ({ page }) => {
    await page.goto('/');
    await page.fill('#url', 'https://example.com');
    await page.press('#url', 'Enter');

    await page.waitForSelector('#resultSection:not(.hidden)', { timeout: 15000 });
    await expect(page.locator('#statusBadge')).toContainText('Generated');
  });
});

test.describe('Feed generation (JSON mode)', () => {
  test('generates RSS from a JSON API source', async ({ page }) => {
    await page.goto('/');
    await setSource(page, 'json');

    // jsonplaceholder returns a top-level array → use * as the item selector
    await page.fill('#url', 'https://jsonplaceholder.typicode.com/posts');
    await page.fill('#item', '*');
    await page.fill('#title', 'title');
    await page.fill('#description', 'body');
    await page.fill('#link', 'id');
    await page.fill('#feedTitle', 'JSONPlaceholder Posts');

    await page.click('#generateBtn');
    await page.waitForSelector('#resultSection:not(.hidden)', { timeout: 30000 });

    await expect(page.locator('#statusBadge')).toContainText('Generated');
    const preview = page.locator('#rssPreview');
    await expect(preview).toContainText('<?xml');
    await expect(preview).toContainText('JSONPlaceholder Posts');
    await expect(preview).toContainText('<title>');
  });

  test('JSON mode hides previous field and excludes it from URL', async ({ page }) => {
    await page.goto('/');
    await openMoreSelectors(page);

    // Fill previous in HTML mode
    await page.fill('#url', 'https://example.com');
    await page.fill('#previous', '.next-link');
    await page.fill('#title', 'h2');

    // Switch to JSON — previous field should be hidden
    await setSource(page, 'json');
    await expect(page.locator('#previousField')).toBeHidden();

    await page.click('#generateBtn');
    await page.waitForSelector('#resultSection:not(.hidden)', { timeout: 15000 });

    const href = await page.locator('#feedUrl').getAttribute('href');
    expect(href).not.toContain('previous');
    expect(href).toContain('source=json');
  });
});

test.describe('Copy URL button', () => {
  test('copy button changes text on click and reverts after timeout', async ({ page }) => {
    await page.goto('/');
    await generateWithUrl(page, 'https://example.com');

    const copyBtn = page.locator('#copyBtn');
    await expect(copyBtn).toContainText('Copy URL');

    await copyBtn.click();
    await expect(copyBtn).toContainText('Copied!');

    // Wait for the 2-second revert timer
    await page.waitForTimeout(2200);
    await expect(copyBtn).toContainText('Copy URL');
  });
});

test.describe('Configuration from URL params', () => {
  test('pre-fills URL from query parameter', async ({ page }) => {
    await page.goto('/?url=https://example.com/blog');
    await expect(page.locator('#url')).toHaveValue('https://example.com/blog');
  });
});
