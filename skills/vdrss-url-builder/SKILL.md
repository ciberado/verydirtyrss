---
name: vdrss-url-builder
description: Generate VeryDirtyRSS feed URLs from any webpage by analyzing its HTML structure. Step-by-step guide to identify CSS selectors for items, titles, links, dates, images, authors, and pagination — then assemble the correct /rss endpoint URL.
---

# VeryDirtyRSS URL Builder

Build a working `/rss?url=...&item=...&title=...&link=...` URL from any webpage by inspecting its DOM and picking the right CSS selectors.

---

## Trigger / Scope

- The user says "make an RSS feed for this page", "generate a VeryDirtyRSS URL", "turn this site into an RSS feed", or similar.
- The user provides a URL and wants a configured `/rss` endpoint URL back.
- Covers HTML pages (CSS selectors) and JSON APIs (JSON path selectors with `source=json`).

---

## Prerequisites

- **A running VeryDirtyRSS instance** — local (`http://localhost:3000`), Docker, or hosted.
- **The target webpage URL** — the page you want to turn into RSS.
- **Browser DevTools** (for humans) or `curl` + `cheerio`/`fetch_url` (for agents).
- **Basic CSS selector knowledge**: `.class`, `#id`, `tag`, `tag > child`, `tag[attr]`, combinators.

---

## Workflow

### Step 1 — Retrieve the page and its HTML

**If you are a human (browser):**
1. Open the target URL in your browser.
2. Open DevTools (F12) → **Elements** tab.
3. Scan the DOM for repeating blocks that contain a title, link, and possibly a date or excerpt. Each block is one RSS item.

**If you are an AI agent:**
1. Fetch the page with `fetch_url`:
   ```
   fetch_url(url="https://example.com/blog", format="raw")
   ```
2. Optionally pipe through a quick structural skim using `grep_files` on a saved copy, or use the `peek` helper in an RLM session to see the repeating pattern.

### Step 2 — Find the repeating item container

Every RSS feed needs an **item selector** — a CSS selector that matches *each* repeating block on the page.

**What to look for:**
- A `<div>`, `<article>`, `<li>`, `<tr>`, or `<section>` that wraps each post/article/entry.
- It repeats identically for every entry on the page.
- It contains all the fields you want (title, link, date, excerpt, image, author).

**How to find it:**

| Approach | Technique |
|----------|-----------|
| **Browser DevTools** | Right-click any post title → Inspect. Walk up the DOM tree until you find the repeating wrapper. Right-click it → Copy → Copy selector. |
| **View page source** | `Ctrl+U`, search for a post title, look at the enclosing tags. |
| **Agent** | Load the HTML and use a simple heuristic: search for repeated `<article>`, `<div class="post">`, `<div class="entry">`, or similar patterns. |

**Common patterns:**
- `.post` — each post block
- `article` — semantic HTML5 article tags
- `.entry` — common in WordPress
- `.blog-item`, `.list-item`, `.card`
- `tr.item` — table rows
- `.feed__item`, `.story`, `.teaser`

**Name this selector** — it becomes your `&item=` parameter.

### Step 3 — Identify each field selector

Now, within ONE item block, locate each field:

#### 3a. Title selector (`&title=`)

The text that becomes the RSS item title.

**How to find it:**
- Usually an `<h1>`, `<h2>`, `<h3>`, `<a>`, or `<span>` inside the item block.
- In DevTools, click the title element → **Copy → Copy selector** gives you something like `h2.entry-title` or `.post-title a`.

**Tip:** If the title is inside a link (`<a>`), include the `<a>` in the selector only if the `<a>` is the title element itself. Often the pattern is:
- `h2` — title is the `<h2>` text
- `.post-title a` — title is inside a link with class `post-title`
- `h3.entry-title a` — title link inside an `<h3>`

#### 3b. Link selector (`&link=`)

The URL each item points to (the article's permalink).

**How to find it:**
- Look for an `<a>` tag whose `href` goes to the full article.
- The link is usually the title's `<a>` or a separate "Read more" `<a>`.
- The selector should point to an element that has an `href` attribute.

**Common patterns:**
- `a` — the first link inside the item (works when each item has one main link)
- `h2 a` — the link inside the title heading
- `.post-title a` — a classed title link
- `.read-more a` — a dedicated read-more link
- `a[href*="blog"]` — links containing "blog" in the URL (advanced)

**Important:** The selector should match the `<a>` element itself, not its parent. The engine reads the `href` attribute.

#### 3c. Description / excerpt selector (`&description=`)

The short summary or excerpt that becomes the RSS item description.

**How to find it:**
- Look for a `<p>`, `<div>`, `<span>`, or meta description inside the item.
- Often classes like `.excerpt`, `.summary`, `.entry-summary`, `.text-inherit`, `.intro`.
- This is optional — if there's no excerpt, you can skip it and the RSS reader will show the title only.

**Tip:** Use a more specific selector than just `p` if there are multiple paragraphs. `.entry-summary` or `.post-excerpt` is safer.

#### 3d. Date selector (`&pubDate=` and `&modified=`)

The publish date or last-modified date for each item.

**How to find it:**
- Look for `<time>` elements, or elements with `datetime` attributes.
- Common patterns:
  - `time` — picks up any `<time>` element
  - `.date time` — `<time>` inside a date container
  - `.entry-date` — a span/div with the date text
  - `time[datetime]` — a `<time>` tag that has a `datetime` attribute

**How it works:** The engine first checks the `datetime` attribute (if present), then falls back to the element's text content. Both are parsed via `new Date()`.

**If no date is available:** omit the parameter. The feed will use the current date.

#### 3e. Image selector (`&image=`)

A featured image or thumbnail URL for each item.

**How to find it:**
- Look for an `<img>` tag inside the item block.
- Common: `.featured-image img`, `.post-thumbnail img`, `img`, `.thumbnail`.
- The engine reads the `src` attribute and resolves relative URLs.

**Optional** — omit if images aren't important.

#### 3f. Author / creator selector (`&creator=`)

The author name for each item.

**How to find it:**
- Look for author links or spans: `.author`, `.byline`, `.entry-author`, `.author-date a`.
- The engine reads the text content of the matched element.

**Optional** — omit for single-author blogs.

#### 3g. Content selector (`&content=`) — for full article bodies

Used only when you also set `fetchContent=true`. This selector is applied to the *article's own page* (the URL from `&link=`), not the listing page.

**How to find it:**
- Visit one article page, inspect the main content area.
- Common: `.post-content`, `.entry-content`, `article`, `.story-body`.
- Required for `fetchContent=true` unless you use `readability=true`.

### Step 4 — Verify selectors individually

#### In a browser (human):

Open the **Console** tab in DevTools and test each selector on the page:

```javascript
// Item count — should be > 0
document.querySelectorAll('PUT_YOUR_ITEM_SELECTOR_HERE').length

// Titles — should return text for each item
Array.from(document.querySelectorAll('PUT_ITEM_SELECTOR PUT_TITLE_SELECTOR')).map(el => el.textContent.trim())

// Links — should return URLs
Array.from(document.querySelectorAll('PUT_ITEM_SELECTOR PUT_LINK_SELECTOR')).map(el => el.href || el.src)

// Dates
Array.from(document.querySelectorAll('PUT_ITEM_SELECTOR PUT_DATE_SELECTOR')).map(el => el.getAttribute('datetime') || el.textContent.trim())
```

Replace `PUT_ITEM_SELECTOR` with your item-level selector and the field selectors accordingly. The engine applies the **field selectors inside each item** using `$(itemElement).find(fieldSelector)`, so you can also use descendant selectors like `h2 a` or `.excerpt p`.

#### As an AI agent:

```javascript
// Fetch the page and use cheerio-like reasoning:
// 1. Load HTML
// 2. $(itemSelector).length — confirms items exist
// 3. $(itemSelector).first().find(titleSelector).text() — tests title extraction
// 4. $(itemSelector).first().find(linkSelector).attr('href') — tests link extraction
```

### Step 5 — Assemble the URL

Format:

```
http://YOUR_SERVER:3000/rss?url=TARGET_URL&item=ITEM_SEL&title=TITLE_SEL&link=LINK_SEL&description=DESC_SEL&pubDate=DATE_SEL&image=IMG_SEL&creator=AUTHOR_SEL
```

**Rules:**
1. **URL-encode the `url` parameter** if it contains special chars (`?`, `&`, `#`, spaces). JavaScript: `encodeURIComponent(url)`. Agent: use the address as-is but watch for conflicts.
2. **Do NOT URL-encode the selector values** — CSS selectors like `.my-class` work fine raw.
3. Only include parameters you have good selectors for. Omitted parameters use defaults.
4. The **order of parameters does not matter**.

**Example (real working URL):**
```
http://localhost:3000/rss?url=https://www.vozpopuli.com/redaccion/roger-senserrich&item=article&title=h2&description=div.text-inherit&link=a
```

### Step 6 — Test the generated feed

```bash
# Quick test with curl
curl "http://localhost:3000/rss?url=https://example.com/blog&item=.post&title=h2&link=a"

# Pipe through head to see the first items
curl -s "http://localhost:3000/rss?..." | head -50

# Validate the XML
curl -s "http://localhost:3000/rss?..." | xmllint --format --noout -
```

If the feed returns 500 or empty items:
1. Check the VeryDirtyRSS server logs for error messages.
2. Verify your selectors again using Step 4.
3. Try with simpler selectors first (e.g., just `&item=article&title=h2&link=a`).
4. If the page loads via JavaScript (SPA), VeryDirtyRSS gets the raw HTML, which may not match what you see in the browser. Look at "View page source" (`Ctrl+U`).

### Step 7 — Iterate and refine

Rarely does the first URL work perfectly. Typical refinement loop:

1. **Test** — curl the RSS URL.
2. **Check** — does it return valid XML with items? Are titles correct? Links resolved?
3. **Fix** — adjust selectors. Common fixes:
   - `&item=` too broad → narrow it (`.post` instead of `div`)
   - `&link=` not finding urls → the `<a>` might be nested deeper (`.title a` instead of just `a`)
   - Dates not parsing → use `time` instead of `.date`
   - Empty descriptions → the excerpt selector is wrong or too strict
4. **Re-test** — curl again.

---

## Advanced Features

### Pagination (`&previous=`) — Crawl older pages

If the page has "Previous", "Older Posts", or pagination links, VeryDirtyRSS can crawl backwards through pages.

**How to set it up:**
1. Find the link/button that goes to the previous page of entries. Inspect it in DevTools.
2. The `previous` selector should match ONE element whose `href` is the previous page URL.
3. Common selectors:
   - `.pagination .prev a` — previous link in pagination
   - `.older-posts a`, `.nav-previous a`
   - `a[rel="prev"]` — rel attribute
   - `.pagination a:first-child` — first pagination link

**Add to URL:**
```
&previous=.pagination .prev a
```

**How it works:** The engine fetches the current page, extracts items, follows the `previous` link, fetches that page, repeats until the selector doesn't match or the URL has been visited already (cycle protection). Items are added in the order they appear across pages.

### Full content fetching (`&fetchContent=true&content=...`)

By default, RSS items only show the excerpt from the listing page. To include full article bodies:

```bash
# With CSS content selector
&fetchContent=true&content=.post-body

# Or with Readability (auto-cleans navigation/ads)
&fetchContent=true&readability=true
```

**When to use each:**
- **`content=`** — when the article body has a clean CSS selector you can identify.
- **`readability=true`** — when you want automatic extraction (strips sidebars, ads, navigation). Works for most blog/article sites.

**Requirements:**
- The `&link=` selector must correctly point to each article's URL.
- For `content=`, the selector is applied to the article page's HTML (not the listing page).
- `readability=true` doesn't need a content selector — it parses the article page automatically.

### JSON API source (`&source=json`)

If the target URL returns JSON instead of HTML, set `source=json` and use JSON path expressions instead of CSS selectors.

**Parameter mapping:**

| HTML parameter | JSON equivalent | Example |
|----------------|-----------------|---------|
| `item=article` | `item=data.items` | JSON path to the items array |
| `title=h2` | `title=title` | JSON path to the title field in each item |
| `link=a` | `link=permalink` | JSON path to the URL field |
| `pubDate=time` | `pubDate=published_at` | JSON path to the date field |

**JSON path syntax:**
- `data.items` — nested field access
- `items[*].title` — wildcard (returns array as-is for `item`)
- `items[0].name` — numeric index

**Example:**
```
http://localhost:3000/rss?url=https://api.example.com/activities&source=json&item=data.items&title=title&description=summary&link=permalink
```

---

## Reference — All Parameters

| Parameter | Purpose | Selector type |
|-----------|---------|---------------|
| `url` | The target webpage URL | Plain URL (URL-encode if needed) |
| `item` | Repeating container for each feed entry | CSS selector |
| `title` | Title text inside each item | CSS selector (relative to item) |
| `description` | Excerpt/summary text | CSS selector (relative to item) |
| `link` | Permalink anchor element | CSS selector (reads `href`) |
| `pubDate` | Publish date | CSS selector (reads `datetime` attr or text) |
| `image` | Featured image | CSS selector (reads `src`) |
| `modified` | Last-modified date | CSS selector (reads `datetime` attr or text) |
| `content` | Full article body (for `fetchContent=true`) | CSS selector (applied to article page) |
| `creator` | Author name | CSS selector (reads text) |
| `previous` | Previous-page navigation link | CSS selector (reads `href`) |
| `source` | `html` (default) or `json` | Literal `html` or `json` |
| `fetchContent` | Enable full-content fetching | `true` or `false` |
| `readability` | Clean article via Readability | `true` or `false` |
| `feedTitle` | Override RSS feed title | Plain text (URL-encode if special chars) |
| `feedDescription` | Override RSS feed description | Plain text (URL-encode if special chars) |
| `cache` | Enable/disable file cache | `true` or `false` |
| `cacheTtlSeconds` | Cache TTL override | Number |

---

## Troubleshooting

| Problem | Likely cause | Fix |
|---------|--------------|-----|
| Empty feed (no items) | `item` selector matches nothing | Check the selector in DevTools `document.querySelectorAll()`. The page might use JS rendering — view page source instead. |
| Wrong titles | `title` selector too broad or wrong | Scope it: if `&item=article`, use `h2` not just `h2` anywhere. Better: `&item=article&title=h2` works within articles. |
| Links are relative URLs | The engine auto-resolves them | This should work — if not, check that `siteUrl` (auto-derived from `url`) is correct. |
| Dates not parsing | Date format not recognized | Use `time` selector (reads `datetime` attribute) instead of a text selector. |
| 500 Internal Server Error | Page unreachable or bad selector | Check URL is valid and accessible. Simplify selectors. Check server logs. |
| Feed shows "... Previous" nav link as content | Navigation links also match your selectors | Tighten the item selector to exclude the nav row, or use `:not()` selectors. |
| JavaScript-rendered page shows no content | VeryDirtyRSS fetches raw HTML (no JS) | Check "View page source" (`Ctrl+U`) — if the content isn't there, this site needs a JS-rendering solution (not supported by VeryDirtyRSS). |

---

## Examples Gallery

### Simple blog
```
/rss?url=https://example.com/blog&item=article&title=h2&link=a&description=p
```

### News site with dates and images
```
/rss?url=https://news.example.com&item=.story&title=h2&link=a&description=.excerpt&pubDate=time&image=img
```

### WordPress blog with pagination
```
/rss?url=https://blog.example.com&item=.post&title=.entry-title a&link=.entry-title a&description=.entry-summary&pubDate=.entry-date time&previous=.nav-previous a
```

### Full content with Readability
```
/rss?url=https://blog.example.com&item=.post&title=.entry-title a&link=.entry-title a&fetchContent=true&readability=true
```

### CSS selector with attribute filtering
```
/rss?url=https://example.com/forum&item=.topic&title=h3 a&link=h3 a&description=.topic-desc&pubDate=time.topic-date&creator=.author
```

---

## Verification Checklist

- [ ] `fetch_url` or browser shows the page loads successfully
- [ ] `item` selector matches at least one element (`document.querySelectorAll(item).length > 0`)
- [ ] `title` selector extracts non-empty text for each item
- [ ] `link` selector finds a valid `href` for each item
- [ ] The assembled RSS URL returns valid XML with `<item>` entries
- [ ] Each RSS item has a `<title>`, `<link>`, and `<description>` (or `<content:encoded>`)
- [ ] Titles are clean (no HTML tags, no extra whitespace)
- [ ] Links are absolute URLs (not relative)
- [ ] Dates parse correctly (if provided)
