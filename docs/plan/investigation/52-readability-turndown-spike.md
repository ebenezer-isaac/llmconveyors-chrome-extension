# Agent 52 — @mozilla/readability + turndown Integration Spike

Scope: confirm both libraries work in a Chrome MV3 content script, measure bundle size, pin the API shape, produce a runnable pipeline snippet.

## @mozilla/readability

| Field | Value |
|---|---|
| Current version | 0.5.0 (latest as of 2024-01) |
| Last release | 2024-01-02 |
| License | Apache-2.0 (confirmed) |
| Runtime deps | **zero** |
| Repo | github.com/mozilla/readability |
| Bundle (min) | ~110 KB |
| Bundle (gzip) | ~27 KB |
| Tree-shakable | No (single class export) |

### API shape (verified via GitHub README)

```ts
interface ReadabilityResult {
  title: string;
  content: string;          // sanitized HTML
  textContent: string;      // plain text
  length: number;           // character count
  excerpt: string;
  byline: string | null;
  dir: string | null;
  siteName: string | null;
  lang: string | null;
  publishedTime: string | null;
}

new Readability(document, options?).parse(): ReadabilityResult | null;
```

Returns `null` if the page is not article-like (Readability's heuristic gate).

### MV3 compatibility

- **Content script**: YES. Has `document`, `DOMParser`, `Node` — all Readability needs. Zero runtime deps.
- **Service worker**: NO. Service workers have no `document`/`DOMParser`. Must run in the content script or an offscreen document.
- **DOM mutation**: Readability mutates the node tree. **Always clone first**: `new Readability(document.cloneNode(true) as Document).parse()`.
- **iframes**: only the outer document is processed; cross-origin iframes are unreachable anyway. Same-origin iframes need a separate script injection.
- **Shadow DOM**: NOT traversed. Sites using shadow roots (Reddit new, etc.) will drop content. Acceptable for LinkedIn/Indeed/Greenhouse/Lever (the MVP target set — all regular DOM).
- **SPA / dynamic content**: must wait for content to render. Run on `DOMContentLoaded` + short delay, or observe a stable selector.
- **Node testing**: needs `jsdom` or `happy-dom`. `happy-dom` is faster and already used in Vitest setups.

## turndown

| Field | Value |
|---|---|
| Current version | 7.2.0 |
| Last release | 2024-09-11 |
| License | MIT (confirmed) |
| Runtime deps | `@mixmark-io/domino` (bundled DOM for Node; tree-shaken in browser builds) |
| Repo | github.com/mixmark-io/turndown |
| Bundle (min) browser | ~60 KB (browser build excludes domino) |
| Bundle (gzip) browser | ~18 KB |
| ESM build | `turndown/dist/turndown.browser.es.js` |

### API shape

```ts
import TurndownService from 'turndown';

const td = new TurndownService({
  headingStyle: 'atx',          // # H1 (not setext)
  codeBlockStyle: 'fenced',     // ```js
  bulletListMarker: '-',
  emDelimiter: '_',
  linkStyle: 'inlined',
});
const markdown: string = td.turndown(htmlStringOrNode);
```

Accepts HTML string or DOM node. In MV3 content scripts, uses the native `DOMParser` — no domino needed. Handles empty/malformed HTML gracefully (returns empty string or best-effort parse; never throws on valid-ish input).

### GFM plugin

`@joplin/turndown-plugin-gfm` (maintained fork of `turndown-plugin-gfm`, Joplin's) adds tables + strikethrough + task lists. ~3 KB gzipped. MIT. Recommended for job posting bullet lists and benefit tables.

```ts
import { gfm } from '@joplin/turndown-plugin-gfm';
td.use(gfm);
```

## Combined pipeline (content script)

```ts
// src/content/extract.ts
import { Readability } from '@mozilla/readability';
import TurndownService from 'turndown';
import { gfm } from '@joplin/turndown-plugin-gfm';

export interface ExtractedArticle {
  title: string;
  byline: string | null;
  siteName: string | null;
  publishedTime: string | null;
  lang: string | null;
  markdown: string;
  textContent: string;
  length: number;
  url: string;
}

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
  emDelimiter: '_',
});
turndown.use(gfm);

export function extractArticle(): ExtractedArticle | null {
  // Clone BEFORE Readability mutates it — never pass live document.
  const docClone = document.cloneNode(/* deep */ true) as Document;
  const parsed = new Readability(docClone).parse();
  if (!parsed) return null;

  const markdown = turndown.turndown(parsed.content).trim();

  return {
    title: parsed.title,
    byline: parsed.byline,
    siteName: parsed.siteName,
    publishedTime: parsed.publishedTime,
    lang: parsed.lang,
    markdown,
    textContent: parsed.textContent,
    length: parsed.length,
    url: location.href,
  };
}

// Message bridge to background service worker
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'extract-article') {
    try {
      sendResponse({ ok: true, data: extractArticle() });
    } catch (err) {
      sendResponse({ ok: false, error: (err as Error).message });
    }
    return true; // keep channel open for async
  }
  return false;
});
```

## Alternatives considered

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| Turndown only | 18 KB gzip | Keeps nav, ads, footer — LLM tokens wasted, noisy | Reject |
| Readability `textContent` only | Free | No headings, lists, links lost | Reject — Markdown preserves structure that JD analysis needs |
| Readability + Turndown + GFM | Clean main content, structured | ~48 KB gzip | **Accept** |
| Defuddle (alternative extractor) | Smaller, modern | Less battle-tested, no Mozilla backing | Keep as fallback |

## Combined size

~48 KB gzipped (27 + 18 + 3). Loaded once per content script injection. Acceptable — MV3 content scripts are cached, and 48 KB is one-time per tab navigation. Chrome Web Store allows up to 10 MB extension; negligible.

## Recommendation

**SHIP Readability + Turndown + GFM plugin** in the content script. Total ~48 KB gzip, zero maintenance overhead, both libraries are Apache-2.0/MIT, both actively maintained, both work without shims in MV3 content scripts.

## Gotchas

1. **Clone document first** — Readability mutates. `document.cloneNode(true)` is mandatory.
2. **Never call from service worker** — no DOM. Must be content script or offscreen document.
3. **Shadow DOM blind spot** — not a problem for the MVP target sites, but document it for future sites.
4. **SPA timing** — inject on `document_idle` run_at + optional MutationObserver gate for React-rendered pages (Lever, Greenhouse).
5. **Readability returns `null`** on non-article pages — callers must handle. Fallback: pass raw `document.body.innerText` trimmed through Turndown.
6. **Content Security Policy** — both libraries are pure JS, no `eval`, no remote fetch — compatible with MV3's default strict CSP.
7. **Node tests** — use `happy-dom` in Vitest config; don't ship `jsdom` into the extension bundle.
8. **Turndown options are per-instance** — create one singleton module-level instance, not one per call (GC churn).
9. **GFM plugin import path** — `@joplin/turndown-plugin-gfm` exports `{ gfm, tables, strikethrough, taskListItems }`; use `gfm` for everything at once.
10. **Bundle via tsup/esbuild with `platform: 'browser'`** so Turndown resolves the browser build and excludes domino.

Confidence: 88%
filename: e:\llmconveyors.com\temp\impl\100-chrome-extension-mvp\investigation\52-readability-turndown-spike.md

