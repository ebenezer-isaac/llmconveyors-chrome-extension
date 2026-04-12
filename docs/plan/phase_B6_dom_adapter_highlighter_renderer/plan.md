# Phase B6 — DOM adapter: highlighter renderer + JD extractor + intent detector

## Phase metadata

| Key | Value |
|---|---|
| **Plan** | 100 — Chrome extension MVP (v2) |
| **Phase** | B6 |
| **Title** | DOM adapter: highlighter renderer + JD extractor + intent detector |
| **Repo** | `e:/ats-autofill-engine` (new repo, separate from `llmconveyors.com`) |
| **Day** | 4 (2026-04-15) |
| **Depends on** | B2 (`src/core/types/**` — specifically `JobPostingData` and `PageIntent` types), B5 (DOM adapter base — shares `src/adapters/dom/index.ts` barrel and a handful of utility helpers) |
| **Does NOT depend on** | Any core keyword-matcher / highlight-planner module. Under Plan 100 v2 (decision memo §2.5 and §2.8) the engine does NOT own keyword matching. Keyword extraction is server-side via `POST /api/v1/ats/extract-skills` (phase A3). The renderer receives a plain `readonly string[]` and finds occurrences itself. |
| **Blocks** | A9 (extension content script imports `applyHighlights`, `detectPageIntent`, `extractJobDescription` from `ats-autofill-engine/dom`) |
| **Estimated effort** | 3 hours |
| **Executor** | Sonnet (64k context) — this plan is self-contained |
| **Confidence** | 9/10 — TreeWalker + splitText rendering is standard, JSON-LD extraction is copy-verbatim from investigation 55, readability + turndown integration is copy-verbatim from investigation 52. Only genuinely new code is the intent-detector URL regexes, which are trivially derived from decision memo §2.6. |

## Scope declaration

- **Files touched**: 14 new (9 source files + 5 test files), 3 modified (`src/adapters/dom/index.ts`, `package.json`, `vitest.config.ts`).
- **Lines changed (estimate)**: ~1,000 LoC source + ~550 LoC tests. No deletions.
- **Out of scope**:
  - Skill-taxonomy loading (handled server-side via phase A3, NEVER in the engine).
  - Content-script harness and messaging glue (A9).
  - `chrome.*` API calls (that's `src/adapters/chrome/**` territory).
  - MutationObserver re-highlight wiring (v1.1 backlog).
  - Core `HighlightRange` type or core highlight planner (do NOT exist in v2).
  - A `planHighlights` / `extractKeywords` function in the engine (removed in v2).

## Required reading (in order)

1. `e:\llmconveyors.com\temp\impl\100-chrome-extension-mvp\00-decision-memo.md`
   - **§2.5** (hex architecture) — confirms the engine has NO core keyword-matching module; the DOM highlighter renderer is a pure "wrap these strings in `<mark>`" utility.
   - **§2.6** (POC scope table) — confirms `@mozilla/readability` + `turndown` are in scope for JD fallback.
   - **§2.8** (keyword extraction flow) — clarifies the end-to-end path: content → background → `/ats/extract-skills` → content → `applyHighlights(document.body, keywords)`. The renderer is the final step and takes a list of keyword strings.
   - **§2.11** (extension architecture) — manual toggle, online-only, graceful degradation when signed out.
2. `e:\llmconveyors.com\temp\impl\100-chrome-extension-mvp\phase_A9_content_script_highlight_and_intent\plan.md`
   - A9 is the direct consumer. Its contract with B6 is **`applyHighlights(document.body, keywordStrings: string[]): () => void`** (a cleanup function). A9 also calls `detectPageIntent(window.location, document)` at content-script bootstrap and `extractJobDescription(document)` before sending the JD text to the backend.
3. `e:\llmconveyors.com\temp\impl\100-chrome-extension-mvp\investigation\48-keyword-highlight-algorithm.md`
   - Section 4 (TreeWalker + Range walk) and section 5 (CSS isolation via scoped `<style>` injection) are authoritative for the rendering algorithm. Ignore any section that talks about a core `planHighlights` or `HighlightRange` type — those existed in v1 only and are dead in v2. Under v2 the rendering core is a single pass: `walkTextNodes` → per-node `findTextMatches(keywords)` → `splitText` wrap.
4. `e:\llmconveyors.com\temp\impl\100-chrome-extension-mvp\investigation\52-readability-turndown-spike.md`
   - Authoritative for the readability + turndown fallback. Copy the pipeline from the "Combined pipeline (content script)" section, split into `readability-fallback.ts` and `jd/index.ts`.
5. `e:\llmconveyors.com\temp\impl\100-chrome-extension-mvp\investigation\55-jsonld-jobposting.md`
   - Authoritative for `extractJobPostingFromDocument`. Copy the extraction routine verbatim into `src/adapters/dom/jd/jsonld-extractor.ts` including every helper (`findJobPosting`, `typeMatches`, `normalizeLocation`, `normalizeOrg`, `normalizeSalary`, `toStr`, `toNum`). Fixtures from section "(h) Test corpus" drive the jsonld-extractor tests.
6. `e:\llmconveyors.com\temp\impl\100-chrome-extension-mvp\phase_B2_core_types_and_taxonomy\plan.md`
   - B2 defines `JobPostingData` and `PageIntent` in `src/core/types/**`. If those types do not exist or differ from what this plan assumes, STOP and fix B2 first; do not fork the types inside the adapter.
7. `e:\llmconveyors.com\temp\impl\100-chrome-extension-mvp\phase_B5_dom_adapter_scanner_filler\plan.md`
   - B5 creates `src/adapters/dom/index.ts` (the barrel) and a handful of shared utilities (logger, DOM helpers). B6 extends that barrel with three new subtrees and MUST NOT touch B5's existing exports.

## Goal

Deliver three browser-coupled, pure-DOM modules under `src/adapters/dom/**` that the Zovo content script will call in A9:

1. **Highlighter renderer** — pure DOM find-and-wrap utility. Given a root `Element` and a list of keyword strings, walk text nodes, find case-insensitive word-bounded matches, wrap them in `<mark data-ats-autofill="true" class="ats-autofill-highlight">` spans, and return a cleanup function that fully restores the DOM. Idempotent: re-running it with a different keyword set first clears all prior marks.
2. **JD extractor** — JSON-LD first (`@type: JobPosting`, including `@graph` traversal), readability + turndown fallback for pages without structured data. Produces a normalised `{ text, structured?, method }` envelope.
3. **Page intent detector** — URL pattern matching for Greenhouse / Lever / Workday / Ashby plus JD-vs-form classification. Returns `{ kind: 'job-posting' | 'application-form' | 'unknown', ats?: 'greenhouse' | 'lever' | 'workday' | 'ashby', jobData?: JobPostingData }`.

After this phase:

- `pnpm --filter ats-autofill-engine test tests/adapters/dom/highlighter/** tests/adapters/dom/jd/** tests/adapters/dom/intent/**` passes — every new module has happy-path plus adversarial edge-case tests.
- `pnpm --filter ats-autofill-engine typecheck` passes under the adapters tsconfig.
- `grep -rn 'chrome\.' src/adapters/dom/highlighter src/adapters/dom/jd src/adapters/dom/intent` returns zero matches.
- `grep -rn 'console\.' src/adapters/dom/highlighter src/adapters/dom/jd src/adapters/dom/intent` returns zero matches.
- `grep -rn 'HighlightRange' src/adapters/dom/` returns zero matches (type does not exist).
- `grep -rn "from '.*core/highlight" src/adapters/dom/` returns zero matches (path does not exist).
- The cleanup function returned by `applyHighlights` fully restores the DOM: after `const clean = applyHighlights(root, ['react']); clean();`, `root.innerHTML` equals the pre-call snapshot (verified by a fixture test using `normalize()`).
- Bundle size delta for the `./dom` sub-entry stays under ~55 KB gzipped (readability ~27 KB + turndown ~18 KB + our code ~5 KB). B6 alone (the three new subtrees) must stay under 35 KB gzipped per the acceptance criteria below.

## Hex architecture boundary check

This phase lives **entirely** under `src/adapters/dom/**`. Rules (enforced by the ESLint `import/no-restricted-paths` configuration installed in B1):

- MAY import from `src/core/types/**`, `src/core/ports/**`, `src/core/taxonomy/**` (type-only or pure TypeScript values).
- MUST NOT import from `src/core/**` any runtime module that would drag the core into browser-only code (core is pure TS and has no such modules by design).
- MUST NOT import from `src/ats/**` (per-ATS modules import us, never the reverse).
- MUST NOT import from `src/adapters/chrome/**` (the chrome adapter is extension-only; the DOM adapter must be usable in any DOM context including content scripts, popups, iframes).
- MUST NOT import from a non-existent `src/core/highlight/**` path. That path was specific to v1 and is deleted in v2. If any file under `src/core/highlight` exists when B6 starts, STOP and ask — it is stale.
- MAY import from the three runtime packages `@mozilla/readability@^0.6.0`, `turndown@^7.2.4`, `@joplin/turndown-plugin-gfm@^1.0.12` (already pinned in B1 package.json if present; otherwise B6 adds them).
- MAY use `Document`, `Element`, `HTMLElement`, `Node`, `NodeFilter`, `Range`, `TreeWalker`, `DOMParser`, `CSSStyleSheet`, `document.adoptedStyleSheets`, `Location` — all DOM types are legal under the adapter tsconfig (which extends `tsconfig.base.json` with `"lib": ["ES2022", "DOM", "DOM.Iterable"]`).

If B1 did not create a separate `tsconfig.adapters.json` that includes `DOM` in `lib`, STOP and report — B6 cannot compile without DOM lib types.

## Files to create

Source:

| # | Path | Purpose | Rough LoC |
|---|------|---------|----------:|
| 1 | `src/adapters/dom/highlighter/renderer.ts` | `applyHighlights(root, keywords)` entry + `splitNodeAtMatches` + `removeAllHighlights` | 130 |
| 2 | `src/adapters/dom/highlighter/text-walker.ts` | `walkTextNodes(root)` generator (TreeWalker wrapper) | 50 |
| 3 | `src/adapters/dom/highlighter/find-matches.ts` | `findTextMatches(text, keywords)` — pure, Node-testable | 90 |
| 4 | `src/adapters/dom/highlighter/styles.ts` | `injectHighlightStyles(doc)` idempotent `<style>` injection | 40 |
| 5 | `src/adapters/dom/highlighter/cleanup.ts` | `removeAllHighlights(root)` stand-alone (also re-exported from renderer) | 40 |
| 6 | `src/adapters/dom/jd/jsonld-extractor.ts` | `extractJobPostingFromDocument(doc)` JSON-LD scan + normalise | 180 |
| 7 | `src/adapters/dom/jd/readability-fallback.ts` | `extractViaReadability(doc)` readability + turndown | 60 |
| 8 | `src/adapters/dom/jd/index.ts` | `extractJobDescription(doc)` pipeline (JSON-LD -> readability -> null) | 60 |
| 9 | `src/adapters/dom/intent/url-patterns.ts` | `URL_PATTERNS` regex table for GH/Lever/Workday/Ashby | 60 |
| 10 | `src/adapters/dom/intent/detector.ts` | `detectPageIntent(location, doc)` | 70 |

Tests:

| # | Path | Environment | Rough LoC |
|---|------|-------------|----------:|
| 11 | `tests/adapters/dom/highlighter/find-matches.spec.ts` | `node` (pure) | 170 |
| 12 | `tests/adapters/dom/highlighter/renderer.spec.ts` | `happy-dom` | 170 |
| 13 | `tests/adapters/dom/jd/jsonld-extractor.spec.ts` | `happy-dom` | 90 |
| 14 | `tests/adapters/dom/jd/readability-fallback.spec.ts` | `happy-dom` | 60 |
| 15 | `tests/adapters/dom/intent/detector.spec.ts` | `happy-dom` | 80 |

## Files to modify

| Path | Change |
|------|--------|
| `src/adapters/dom/index.ts` | Add re-exports: `applyHighlights`, `removeAllHighlights`, `walkTextNodes`, `findTextMatches`, `injectHighlightStyles` from the highlighter subtree; `extractJobDescription`, `extractJobPostingFromDocument`, `extractViaReadability` from the JD subtree; `detectPageIntent`, `URL_PATTERNS` and the `PageIntent` / `Ats` types from the intent subtree. DO NOT modify or reorder B5's existing exports. |
| `package.json` | Add runtime deps `@mozilla/readability@^0.6.0`, `turndown@^7.2.4`, `@joplin/turndown-plugin-gfm@^1.0.12` under `"dependencies"`. Add dev dep `@types/turndown@^5.0.5` under `"devDependencies"`. (If B1 already added these, skip — do NOT downgrade.) |
| `vitest.config.ts` | Ensure `environmentMatchGlobs` routes `tests/adapters/dom/**` to `happy-dom` except `tests/adapters/dom/highlighter/find-matches.spec.ts`, which routes to `node` (that file tests a pure string function and should not pay for a DOM environment). |

## Step-by-step implementation

1. **Verify prerequisites**. Confirm `src/core/types/JobPostingData.ts` (or `src/core/types/job-posting.ts`) exists from B2 and exports a `JobPostingData` interface. Confirm `src/core/types/page-intent.ts` exports `PageIntent` and `Ats` type aliases. If either is missing, STOP and ask — do not re-declare the types inside the adapter. Also confirm that no file under `src/core/highlight/` exists; if one does, it is stale from v1, flag it to the architect and do not import it.
2. **Install dependencies**. In the engine repo root run `pnpm add @mozilla/readability@^0.6.0 turndown@^7.2.4 @joplin/turndown-plugin-gfm@^1.0.12` and `pnpm add -D @types/turndown@^5.0.5`. Verify `package.json` lockfile updates cleanly.
3. **Create `src/adapters/dom/highlighter/` directory**. Add an `index.ts` barrel that the renderer, walker, find-matches, styles, and cleanup modules will populate as you go.
4. **Implement `src/adapters/dom/highlighter/text-walker.ts`**. Export a generator `walkTextNodes(root: Element): Generator<Text>` that constructs a `TreeWalker` with `NodeFilter.SHOW_TEXT` and a filter callback that rejects: (a) text nodes whose parent element is `<script>`, `<style>`, or `<noscript>`; (b) text nodes whose parent element already has the `data-ats-autofill` attribute (i.e. is inside an existing highlight `<mark>`); (c) text nodes with null or whitespace-only content. Yield each accepted text node in document order.
5. **Implement `src/adapters/dom/highlighter/find-matches.ts`**. Export a pure function `findTextMatches(text: string, keywords: readonly string[]): Array<{ start: number; end: number; keyword: string }>`. Algorithm:
   - Short-circuit if `text.length === 0` or `keywords.length === 0`.
   - Lowercase the input once into `lowerText` (avoid repeated allocations).
   - For each keyword (lowercased), `indexOf`-scan `lowerText` and emit candidate matches into a `raw` array.
   - Enforce a word-boundary check: the character immediately before the match and immediately after the match must both be non-alphanumeric (ASCII heuristic: not `[0-9A-Za-z]`). Text boundaries (index 0 or index `text.length`) count as boundaries.
   - Resolve overlaps by sorting `raw` first by `start` ascending, then by match length descending, and walking the list keeping `lastEnd`; any match whose `start < lastEnd` is skipped. Longest-match-wins on overlap (so when keywords `React` and `React Native` both match a `React Native` substring, `React Native` wins).
   - Return the resolved list.
6. **Implement `src/adapters/dom/highlighter/styles.ts`**. Export `injectHighlightStyles(doc: Document): () => void`. Use a module-level constant `STYLE_ID = 'ats-autofill-highlight-styles'`. If the document already contains an element with that id, return a no-op cleanup. Otherwise create a `<style>` element with that id, set its `textContent` to a minimal CSS block styling `mark[data-ats-autofill="true"].ats-autofill-highlight` (background `rgba(255, 230, 0, 0.45)`, inherited color, 1px horizontal padding, 2px border-radius). Append to `doc.head`. Return a cleanup closure that removes the style element by id.
7. **Implement `src/adapters/dom/highlighter/cleanup.ts`**. Export `removeAllHighlights(root: Element): void`. Query `root.querySelectorAll('mark[data-ats-autofill="true"]')`, iterate the static `Array.from` snapshot (not the live NodeList), and unwrap each mark: move its child nodes up to its parent before the mark, then remove the mark. Call `parent.normalize()` after removal to merge adjacent text nodes. This function runs independently of the renderer's return closure so tests and consumers can call it directly.
8. **Implement `src/adapters/dom/highlighter/renderer.ts`**. Top-level constants: `MARK_ATTR = 'data-ats-autofill'`, `MARK_CLASS = 'ats-autofill-highlight'`. Exports:
   - `applyHighlights(root: Element, keywords: readonly string[]): () => void` — the public entry.
   - `removeAllHighlights` re-exported from `./cleanup.ts`.
   Inside `applyHighlights`:
   1. If `keywords.length === 0`, return a no-op cleanup immediately.
   2. Call `removeAllHighlights(root)` to clear any prior marks (idempotency).
   3. Resolve `doc = root.ownerDocument ?? document`.
   4. Inject styles via `injectHighlightStyles(doc)` and keep the returned cleanup as `cleanupStyles`.
   5. Collect text nodes by materialising the `walkTextNodes(root)` generator into an array BEFORE any mutation (splitting text nodes while walking invalidates the walker).
   6. For each text node, call `findTextMatches(node.nodeValue ?? '', keywords)`. If the result is empty, continue. Otherwise call `splitNodeAtMatches(node, matches)` and push any returned marks onto `insertedMarks`.
   7. Return a `cleanup()` closure that iterates `insertedMarks`, unwraps each one (move children up, remove mark), calls `parent.normalize()`, and finally calls `cleanupStyles()`.
9. **Implement `splitNodeAtMatches(node, matches)`**. Iterate matches **right-to-left** (sorted by `start` descending) so that `splitText` calls to the right of the current position don't invalidate earlier indices. For each match:
   1. `const after = node.splitText(match.end)` — `node` now holds `text[0..match.end]`, `after` holds the rest.
   2. `const target = node.splitText(match.start)` — `node` now holds `text[0..match.start]`, `target` holds `text[match.start..match.end]`.
   3. Create `<mark>` element with `data-ats-autofill="true"` and `class="ats-autofill-highlight"`.
   4. Replace `target` with `mark`, then append `target` as `mark`'s child.
   5. Push the mark onto a `marks` array.
   Return `{ marks }`.
10. **Create `src/adapters/dom/highlighter/index.ts` barrel**. Export everything: `applyHighlights`, `removeAllHighlights`, `walkTextNodes`, `findTextMatches`, `injectHighlightStyles`.
11. **Create `src/adapters/dom/jd/` directory**.
12. **Implement `src/adapters/dom/jd/jsonld-extractor.ts`**. Copy the extraction routine from investigation 55 section "(e) Extraction code" verbatim, wrapped in TypeScript and exported as `extractJobPostingFromDocument(doc: Document): JobPostingData | null`. The routine:
    1. Selects `script[type="application/ld+json"]` elements.
    2. For each, tries `JSON.parse(script.textContent ?? '')` inside a try/catch; swallows parse errors and continues.
    3. Calls `findJobPosting(parsed)` — a recursive helper that returns the first object with `@type === 'JobPosting'` (or `@type` array containing `'JobPosting'`) found anywhere in the tree, including `@graph` arrays.
    4. Calls `flattenJobPosting(posting)` to normalise the structured fields into the `JobPostingData` shape from B2.
    5. Returns `null` if no posting is found across all scripts.
    The flattener uses defensive `toStr`/`toNum` coercions, handles `hiringOrganization` either as an object or a string, handles `jobLocation` as an object, array, or missing, and preserves the raw JSON-LD object in a `raw: unknown` field for debugging.
13. **Implement `src/adapters/dom/jd/readability-fallback.ts`**. Export `async function extractViaReadability(doc: Document): Promise<string | null>`. Algorithm:
    1. Clone the document: `const clone = doc.cloneNode(true) as Document`. Readability mutates its input; we must never touch the live DOM.
    2. Construct `new Readability(clone)` and call `parse()`.
    3. If the result is null or has no `content`, return null.
    4. Construct `new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' })`, optionally add the gfm plugin (`turndown.use(gfm)`), and `return turndown.turndown(result.content)`.
14. **Implement `src/adapters/dom/jd/index.ts`**. Export `async function extractJobDescription(doc: Document): Promise<{ text: string; structured?: JobPostingData; method: 'jsonld' | 'readability' } | null>`. Pipeline:
    1. Call `extractJobPostingFromDocument(doc)`. If it returns a value, return `{ text: stripHtml(structured.description), structured, method: 'jsonld' }`.
    2. Otherwise call `extractViaReadability(doc)`. If it returns a non-empty string, return `{ text: markdown, method: 'readability' }`.
    3. Otherwise return `null`.
    The local `stripHtml(html)` helper creates a `div`, sets `innerHTML`, and returns `textContent?.trim() ?? ''`. Prefer `doc.createElement('div')` so this works outside the global `document` in tests.
15. **Create `src/adapters/dom/jd/index.ts` barrel entry**. (The file above IS the barrel — export `extractJobDescription`, `extractJobPostingFromDocument`, `extractViaReadability` from it.)
16. **Create `src/adapters/dom/intent/` directory**.
17. **Implement `src/adapters/dom/intent/url-patterns.ts`**. Define a typed `Ats = 'greenhouse' | 'lever' | 'workday' | 'ashby'` and a `URL_PATTERNS: Record<Ats, { posting: RegExp; form: RegExp }>` table. Use the regexes shown in the "Code snippets" section below (the `form` entry is evaluated **before** `posting` in the detector so a Greenhouse URL ending in `/apply` is classified as `application-form`, not `job-posting`). Export both.
18. **Implement `src/adapters/dom/intent/detector.ts`**. Export `detectPageIntent(location: Location, doc: Document): PageIntent`. For each `Ats` in a deterministic iteration order (`greenhouse`, `lever`, `workday`, `ashby`):
    1. Test the `form` regex against `location.href`. On match return `{ kind: 'application-form', ats }`.
    2. Test the `posting` regex. On match, call `extractJobPostingFromDocument(doc)` to collect `jobData` and return `{ kind: 'job-posting', ats, jobData: jobData ?? undefined }`.
    3. Otherwise continue.
    If no pattern matches, return `{ kind: 'unknown' }`. Never throw.
19. **Create `src/adapters/dom/intent/index.ts` barrel**. Export `detectPageIntent`, `URL_PATTERNS`, and re-export the `PageIntent`, `Ats` types.
20. **Update `src/adapters/dom/index.ts`**. Append three blocks of re-exports (highlighter, jd, intent) beneath B5's existing exports. Do NOT modify B5's re-exports. Preserve alphabetical ordering within each block. Keep the file below 100 lines.
21. **Update `vitest.config.ts`**. Add a pattern to `environmentMatchGlobs` (or equivalent test environment router) so that `tests/adapters/dom/highlighter/find-matches.spec.ts` runs under `node` while every other `tests/adapters/dom/**` test runs under `happy-dom`. Order matters: the more-specific glob must come first.
22. **Write `tests/adapters/dom/highlighter/find-matches.spec.ts`** (pure Node). Cover:
    1. Empty text returns `[]`.
    2. Empty keywords returns `[]`.
    3. Single exact match.
    4. Case-insensitive match (`react` keyword matches `React` in text, returns the original keyword).
    5. Multiple matches of one keyword in the same string.
    6. Word boundary: keyword `Java` does **not** match substring `JavaScript`.
    7. Word boundary: keyword `C++` at the start/end of string is matched correctly (text boundary counts as a word boundary). Note: `+` is non-alphanumeric so this works.
    8. Punctuation neighbors are boundaries (`React,` matches `React`).
    9. Overlap resolution: keywords `React` and `React Native` both present; result for text `React Native` is a single match of `React Native` (longest wins).
    10. Non-overlapping adjacent matches are both retained.
    11. Multi-word keyword spanning a single text node: `distributed systems` matches the exact substring.
    12. Empty keyword string in the array is skipped (no crash).
    13. Duplicate keywords do not produce duplicate matches at the same position.
    14. Unicode pass-through (e.g. `café` matches `café` — NOT required to handle diacritic folding in v1).
    15. Very long text (10 KB) with 50 keywords completes in under 50 ms.
23. **Write `tests/adapters/dom/highlighter/renderer.spec.ts`** (happy-dom). Fixtures constructed inline via `document.body.innerHTML = '...'`. Cover:
    1. Happy path: `<p>React and TypeScript rock.</p>` with keywords `['React', 'TypeScript']` wraps both and leaves surrounding text intact.
    2. Cleanup: capture `body.innerHTML` snapshot, apply, call cleanup, assert `body.innerHTML` matches snapshot after `.normalize()`.
    3. Idempotency: call `applyHighlights` twice with different keyword sets; assert only the second set's marks remain and the DOM is otherwise unchanged.
    4. Word boundary: keyword `Java` with text `I love JavaScript` produces zero marks.
    5. Case insensitive: keyword `react` with text `React is...` produces one mark wrapping `React`.
    6. Nested elements: keyword split across sibling text nodes (e.g. `<p>dist<b>ributed</b></p>`) is NOT matched (v1 limitation; v1.1 could fix by joining-then-projecting). Document this limitation in an inline code comment on the test.
    7. `<script>` and `<style>` contents are NEVER highlighted even if they textually contain a keyword.
    8. Re-running on a root that already has a stray `<mark data-ats-autofill="true">` from a previous session first clears it.
    9. Empty keyword array returns a no-op cleanup immediately (no style injection, no mutation).
    10. Style element is injected on first call and removed on cleanup.
    11. Multiple matches in one text node are all wrapped correctly (right-to-left splitting leaves earlier indices valid).
24. **Write `tests/adapters/dom/jd/jsonld-extractor.spec.ts`**. Cover:
    1. Simple `JobPosting` JSON-LD at top level -> returns normalised data.
    2. JobPosting inside `@graph` array -> returns it.
    3. Multiple `script[type="application/ld+json"]` elements with only the second containing a JobPosting -> returns the second.
    4. Malformed JSON in one script does not abort the scan -> still returns the next valid one.
    5. `hiringOrganization` as a string (not an object) is normalised to `{ name: <string> }`.
    6. No JSON-LD script at all -> returns `null`.
    7. Non-JobPosting JSON-LD (e.g. `WebPage`) -> returns `null`.
    8. Fixture HTML blobs live inline as template literals; tests set `document.documentElement.innerHTML = fixture` inside each `it` to avoid shared state.
25. **Write `tests/adapters/dom/jd/readability-fallback.spec.ts`**. Cover:
    1. A simple article-like fixture (`<article><h1>Title</h1><p>Body</p></article>`) produces a non-empty markdown string containing `# Title` and `Body`.
    2. A page with no extractable content returns `null`.
    3. Readability never mutates the original `document` (assert `document.body.innerHTML` is unchanged after the call).
26. **Write `tests/adapters/dom/intent/detector.spec.ts`**. Cover at least 20 URL inputs across the four ATSes times `{posting, form, unknown}`. Include:
    1. `https://boards.greenhouse.io/acme/jobs/123456` -> `{ kind: 'job-posting', ats: 'greenhouse' }`.
    2. `https://boards.greenhouse.io/acme/jobs/123456#app` -> `{ kind: 'application-form', ats: 'greenhouse' }`.
    3. `https://job-boards.greenhouse.io/acme/jobs/123456` -> posting (both subdomains accepted).
    4. `https://jobs.lever.co/acme/abc12345-def6-7890-abcd-ef0123456789` -> posting.
    5. `https://jobs.lever.co/acme/abc12345-def6-7890-abcd-ef0123456789/apply` -> form.
    6. `https://acme.myworkdayjobs.com/External/job/Remote-USA/Senior-Engineer_R-12345` -> posting.
    7. `https://acme.myworkdayjobs.com/External/task/...` -> form.
    8. `https://jobs.ashbyhq.com/acme/abc12345-def6-7890-abcd-ef0123456789` -> posting.
    9. `https://jobs.ashbyhq.com/acme/abc12345-def6-7890-abcd-ef0123456789/application` -> form.
    10. `https://www.example.com/careers/engineer-role` -> unknown.
    11. Confirm `jobData` is populated on posting pages when JSON-LD is present in the fixture.
    12. Confirm `jobData` is `undefined` on posting pages when no JSON-LD is present.
27. **Run `pnpm --filter ats-autofill-engine typecheck`**. Fix any type errors. Never suppress with `any` or `@ts-ignore`. Resolve unresolved imports by fixing them, not by renaming.
28. **Run `pnpm --filter ats-autofill-engine test tests/adapters/dom/**`**. All tests must pass. If a test fails, fix the code, not the test expectations.
29. **Run `pnpm --filter ats-autofill-engine build`**. Confirm the `./dom` sub-entry builds cleanly. Inspect `dist/adapters/dom/` and confirm no `src/core/highlight` imports, no `HighlightRange` identifier, no `chrome.` references.
30. **Run `pnpm --filter ats-autofill-engine lint`**. Zero warnings. Fix import ordering, unused variables, and explicit-any violations before committing.
31. **Check bundle size**. Run `du -sh dist/adapters/dom/highlighter dist/adapters/dom/jd dist/adapters/dom/intent` and confirm total stays under 35 KB gzipped for the three new subtrees (excluding the readability + turndown runtime bundles, which are third-party).
32. **Update `src/adapters/dom/index.ts`** one last time to confirm exports resolve. Run `pnpm typecheck` again.
33. **Verify A9's consumer contract**. Open `phase_A9_content_script_highlight_and_intent/plan.md` and grep for `applyHighlights`. A9 MUST call `applyHighlights(document.body, keywordStrings)` where `keywordStrings` is a `readonly string[]` (the plain terms returned by `POST /api/v1/ats/extract-skills`). If any A9 reference still passes `HighlightRange[]` or a precomputed-ranges structure, flag it in the executor report so the A9 plan gets its own rewrite pass — but do NOT change A9 from inside B6.
34. **Update the phase status in the plan index** (if one exists: `e:/llmconveyors.com/temp/impl/100-chrome-extension-mvp/00-phase-index.md`) from `PENDING` to `IMPLEMENTED` for B6 and note any downstream cleanup required.
35. **Commit**. Conventional commit prefix `feat(100-B6):`. Message body summarises the three subtrees and notes "no core highlight-planner module; renderer takes `readonly string[]` per v2 §2.5".

## Code snippets (critical)

### 1. Renderer main entry — `src/adapters/dom/highlighter/renderer.ts`

```ts
import { walkTextNodes } from './text-walker';
import { findTextMatches } from './find-matches';
import { injectHighlightStyles } from './styles';
import { removeAllHighlights } from './cleanup';

const MARK_ATTR = 'data-ats-autofill';
const MARK_CLASS = 'ats-autofill-highlight';

export { removeAllHighlights } from './cleanup';

/**
 * Wraps all case-insensitive, word-bounded occurrences of the given
 * keywords inside `<mark data-ats-autofill="true">` spans under `root`.
 *
 * Idempotent: any existing highlights under `root` are cleared first.
 *
 * @returns A cleanup function that unwraps every mark this invocation
 *          inserted and removes the injected <style> element.
 */
export function applyHighlights(
  root: Element,
  keywords: readonly string[],
): () => void {
  if (keywords.length === 0) {
    return () => {
      /* no-op */
    };
  }

  // Clear any prior highlights under the same root first.
  removeAllHighlights(root);

  const doc = root.ownerDocument ?? document;
  const cleanupStyles = injectHighlightStyles(doc);
  const insertedMarks: HTMLElement[] = [];

  // Materialise the walker before we start mutating — splitText calls
  // invalidate a live TreeWalker pointer.
  const textNodes: Text[] = [];
  for (const node of walkTextNodes(root)) {
    textNodes.push(node);
  }

  for (const node of textNodes) {
    const matches = findTextMatches(node.nodeValue ?? '', keywords);
    if (matches.length === 0) continue;
    const { marks } = splitNodeAtMatches(node, matches);
    for (const mark of marks) insertedMarks.push(mark);
  }

  return function cleanup(): void {
    for (const mark of insertedMarks) {
      const parent = mark.parentNode;
      if (!parent) continue;
      while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
      parent.removeChild(mark);
      if (parent.nodeType === Node.ELEMENT_NODE) {
        (parent as Element & { normalize(): void }).normalize();
      }
    }
    cleanupStyles();
  };
}

function splitNodeAtMatches(
  node: Text,
  matches: ReadonlyArray<{ start: number; end: number; keyword: string }>,
): { marks: HTMLElement[] } {
  // Right-to-left so indices on the "left side" stay valid as we split.
  const sortedMatches = [...matches].sort((a, b) => b.start - a.start);
  const marks: HTMLElement[] = [];
  const doc = node.ownerDocument;
  if (!doc) return { marks };

  for (const match of sortedMatches) {
    // node currently holds text[0..end]; split off the tail first.
    node.splitText(match.end);
    // Now split off the match region itself.
    const target = node.splitText(match.start);
    const mark = doc.createElement('mark');
    mark.setAttribute(MARK_ATTR, 'true');
    mark.className = MARK_CLASS;
    const parent = target.parentNode;
    if (!parent) continue;
    parent.replaceChild(mark, target);
    mark.appendChild(target);
    marks.push(mark);
    // `node` now holds text[0..match.start] and the loop continues
    // with the next (earlier) match still referencing valid indices.
  }
  return { marks };
}
```

### 2. Text walker — `src/adapters/dom/highlighter/text-walker.ts`

```ts
/**
 * Yields every text node under `root` that is eligible for highlighting.
 *
 * Rejects:
 *   - text inside <script>, <style>, or <noscript>
 *   - text inside an element already wrapped with data-ats-autofill
 *   - empty or whitespace-only text nodes
 */
export function* walkTextNodes(root: Element): Generator<Text> {
  const doc = root.ownerDocument ?? document;
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;

      const tag = parent.tagName;
      if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT') {
        return NodeFilter.FILTER_REJECT;
      }
      if (parent.hasAttribute('data-ats-autofill')) {
        // Already inside an existing mark — skip so re-runs stay idempotent.
        return NodeFilter.FILTER_REJECT;
      }
      if (!node.nodeValue || node.nodeValue.trim().length === 0) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  let current = walker.nextNode() as Text | null;
  while (current) {
    yield current;
    current = walker.nextNode() as Text | null;
  }
}
```

### 3. Find matches — `src/adapters/dom/highlighter/find-matches.ts`

```ts
/**
 * Pure string utility. Given `text` and `keywords`, returns every
 * case-insensitive, word-bounded, non-overlapping match, with the
 * longest keyword winning on overlap.
 *
 * Pure ASCII word-boundary heuristic: a boundary is any position whose
 * neighbouring character is outside [0-9A-Za-z], or a text boundary.
 * Unicode-aware boundaries are a v1.1 concern.
 */
export function findTextMatches(
  text: string,
  keywords: readonly string[],
): Array<{ start: number; end: number; keyword: string }> {
  if (text.length === 0 || keywords.length === 0) return [];

  const lowerText = text.toLowerCase();
  const raw: Array<{ start: number; end: number; keyword: string }> = [];

  for (const kw of keywords) {
    if (kw.length === 0) continue;
    const needle = kw.toLowerCase();
    let from = 0;

    while (from <= lowerText.length - needle.length) {
      const idx = lowerText.indexOf(needle, from);
      if (idx === -1) break;

      const before = idx > 0 ? lowerText.charCodeAt(idx - 1) : 0;
      const after =
        idx + needle.length < lowerText.length
          ? lowerText.charCodeAt(idx + needle.length)
          : 0;

      if (isBoundary(before) && isBoundary(after)) {
        raw.push({ start: idx, end: idx + needle.length, keyword: kw });
      }
      from = idx + needle.length;
    }
  }

  // Sort so that the longest match at each start wins.
  raw.sort(
    (a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start),
  );

  const resolved: Array<{ start: number; end: number; keyword: string }> = [];
  let lastEnd = -1;
  for (const m of raw) {
    if (m.start < lastEnd) continue; // overlaps with a longer earlier match
    resolved.push(m);
    lastEnd = m.end;
  }
  return resolved;
}

function isBoundary(code: number): boolean {
  if (code === 0) return true; // text boundary
  const isDigit = code >= 48 && code <= 57;
  const isUpper = code >= 65 && code <= 90;
  const isLower = code >= 97 && code <= 122;
  return !(isDigit || isUpper || isLower);
}
```

### 4. Styles injection — `src/adapters/dom/highlighter/styles.ts`

```ts
const STYLE_ID = 'ats-autofill-highlight-styles';

/**
 * Idempotent. If the style element already exists, returns a no-op cleanup.
 * Otherwise injects a scoped <style> into <head> and returns a cleanup
 * closure that removes it.
 */
export function injectHighlightStyles(doc: Document): () => void {
  if (doc.getElementById(STYLE_ID)) {
    return () => {
      /* already present; another apply call owns it */
    };
  }

  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    mark[data-ats-autofill="true"].ats-autofill-highlight {
      background-color: rgba(255, 230, 0, 0.45);
      color: inherit;
      padding: 0 1px;
      border-radius: 2px;
    }
  `;
  doc.head.appendChild(style);

  return function cleanup(): void {
    const el = doc.getElementById(STYLE_ID);
    if (el && el.parentNode) el.parentNode.removeChild(el);
  };
}
```

### 5. Cleanup (stand-alone) — `src/adapters/dom/highlighter/cleanup.ts`

```ts
/**
 * Unwraps every <mark data-ats-autofill="true"> element under `root`.
 * Callable independently of `applyHighlights` so consumers can reset a
 * DOM tree they don't fully own.
 */
export function removeAllHighlights(root: Element): void {
  const marks = root.querySelectorAll<HTMLElement>('mark[data-ats-autofill="true"]');
  for (const mark of Array.from(marks)) {
    const parent = mark.parentNode;
    if (!parent) continue;
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
    parent.removeChild(mark);
    if (parent.nodeType === Node.ELEMENT_NODE) {
      (parent as Element & { normalize(): void }).normalize();
    }
  }
}
```

### 6. JSON-LD JobPosting extractor — `src/adapters/dom/jd/jsonld-extractor.ts`

```ts
import type { JobPostingData } from '../../../core/types/job-posting';

/**
 * Scans every <script type="application/ld+json"> element and returns the
 * first `JobPosting` node found (including inside `@graph` arrays).
 * Malformed JSON in any one script does NOT abort the scan.
 */
export function extractJobPostingFromDocument(
  doc: Document,
): JobPostingData | null {
  const scripts = doc.querySelectorAll<HTMLScriptElement>(
    'script[type="application/ld+json"]',
  );
  for (const script of Array.from(scripts)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(script.textContent ?? '');
    } catch {
      continue;
    }
    const posting = findJobPosting(parsed);
    if (posting) return flattenJobPosting(posting);
  }
  return null;
}

function findJobPosting(node: unknown): Record<string, unknown> | null {
  if (node == null) return null;

  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findJobPosting(item);
      if (found) return found;
    }
    return null;
  }

  if (typeof node === 'object') {
    const obj = node as Record<string, unknown>;
    if (typeMatches(obj['@type'], 'JobPosting')) return obj;

    if (Array.isArray(obj['@graph'])) {
      for (const item of obj['@graph']) {
        const found = findJobPosting(item);
        if (found) return found;
      }
    }
  }
  return null;
}

function typeMatches(value: unknown, wanted: string): boolean {
  if (value === wanted) return true;
  if (Array.isArray(value)) return value.includes(wanted);
  return false;
}

function flattenJobPosting(
  posting: Record<string, unknown>,
): JobPostingData {
  return {
    title: toStr(posting.title),
    description: toStr(posting.description),
    hiringOrganization: normalizeOrg(posting.hiringOrganization),
    jobLocation: normalizeLocation(posting.jobLocation),
    datePosted: toStrOrUndefined(posting.datePosted),
    employmentType: toStrOrUndefined(posting.employmentType),
    baseSalary: normalizeSalary(posting.baseSalary),
    raw: posting,
  };
}

function normalizeOrg(value: unknown): { name: string; url?: string } | undefined {
  if (!value) return undefined;
  if (typeof value === 'string') return { name: value };
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const name = toStr(obj.name);
    if (!name) return undefined;
    const url = toStrOrUndefined(obj.url);
    return url ? { name, url } : { name };
  }
  return undefined;
}

function normalizeLocation(
  value: unknown,
): Array<{ city?: string; country?: string }> | undefined {
  const items: Array<{ city?: string; country?: string }> = [];
  const push = (item: unknown): void => {
    if (!item || typeof item !== 'object') return;
    const obj = item as Record<string, unknown>;
    const address = obj.address as Record<string, unknown> | undefined;
    if (!address || typeof address !== 'object') return;
    items.push({
      city: toStrOrUndefined(address.addressLocality),
      country: toStrOrUndefined(address.addressCountry),
    });
  };
  if (Array.isArray(value)) value.forEach(push);
  else push(value);
  return items.length > 0 ? items : undefined;
}

function normalizeSalary(
  value: unknown,
): { minValue?: number; maxValue?: number; currency?: string } | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const obj = value as Record<string, unknown>;
  const v = obj.value as Record<string, unknown> | undefined;
  if (!v || typeof v !== 'object') return undefined;
  return {
    minValue: toNumOrUndefined(v.minValue),
    maxValue: toNumOrUndefined(v.maxValue),
    currency: toStrOrUndefined(obj.currency),
  };
}

function toStr(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

function toStrOrUndefined(value: unknown): string | undefined {
  const s = toStr(value);
  return s.length > 0 ? s : undefined;
}

function toNumOrUndefined(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}
```

### 7. Readability fallback — `src/adapters/dom/jd/readability-fallback.ts`

```ts
import { Readability } from '@mozilla/readability';
import TurndownService from 'turndown';
// @ts-expect-error — turndown-plugin-gfm ships without types
import { gfm } from '@joplin/turndown-plugin-gfm';

/**
 * Runs Mozilla Readability against a clone of the document (Readability
 * mutates its input), then converts the extracted content to Markdown.
 * Returns null if Readability finds no article.
 */
export async function extractViaReadability(doc: Document): Promise<string | null> {
  const clone = doc.cloneNode(true) as Document;
  const reader = new Readability(clone);
  const result = reader.parse();
  if (!result || !result.content) return null;

  const turndown = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
  });
  turndown.use(gfm);
  const markdown = turndown.turndown(result.content).trim();
  return markdown.length > 0 ? markdown : null;
}
```

### 8. JD extractor pipeline — `src/adapters/dom/jd/index.ts`

```ts
import type { JobPostingData } from '../../../core/types/job-posting';
import { extractJobPostingFromDocument } from './jsonld-extractor';
import { extractViaReadability } from './readability-fallback';

export { extractJobPostingFromDocument } from './jsonld-extractor';
export { extractViaReadability } from './readability-fallback';

export interface JobDescriptionResult {
  text: string;
  structured?: JobPostingData;
  method: 'jsonld' | 'readability';
}

/**
 * Two-stage extraction:
 *   1. JSON-LD JobPosting (cheap, deterministic, vendor-provided)
 *   2. Readability + turndown fallback (expensive, best-effort)
 * Returns null when neither yields usable text.
 */
export async function extractJobDescription(
  doc: Document,
): Promise<JobDescriptionResult | null> {
  const structured = extractJobPostingFromDocument(doc);
  if (structured && structured.description.length > 0) {
    return {
      text: stripHtml(doc, structured.description),
      structured,
      method: 'jsonld',
    };
  }

  const markdown = await extractViaReadability(doc);
  if (markdown && markdown.length > 0) {
    return { text: markdown, method: 'readability' };
  }

  return null;
}

function stripHtml(doc: Document, html: string): string {
  const tmp = doc.createElement('div');
  tmp.innerHTML = html;
  return (tmp.textContent ?? '').trim();
}
```

### 9. URL patterns — `src/adapters/dom/intent/url-patterns.ts`

```ts
export type Ats = 'greenhouse' | 'lever' | 'workday' | 'ashby';

/**
 * Order matters at detection time: the `form` regex is tested BEFORE
 * `posting` so a Greenhouse URL ending in `#app` or `/apply` classifies
 * as an application form rather than a job posting.
 */
export const URL_PATTERNS: Record<Ats, { posting: RegExp; form: RegExp }> = {
  greenhouse: {
    form: /^https?:\/\/(?:boards|job-boards)\.greenhouse\.io\/[a-z0-9-]+\/jobs\/\d+(?:#app|\/apply)/i,
    posting: /^https?:\/\/(?:boards|job-boards)\.greenhouse\.io\/[a-z0-9-]+\/jobs\/\d+/i,
  },
  lever: {
    form: /^https?:\/\/jobs\.lever\.co\/[a-z0-9-]+\/[a-f0-9-]+\/apply/i,
    posting: /^https?:\/\/jobs\.lever\.co\/[a-z0-9-]+\/[a-f0-9-]+/i,
  },
  workday: {
    form: /^https?:\/\/[a-z0-9-]+\.myworkdayjobs\.com\/.*\/task\//i,
    posting: /^https?:\/\/[a-z0-9-]+\.myworkdayjobs\.com\/.*\/job\//i,
  },
  ashby: {
    form: /^https?:\/\/jobs\.ashbyhq\.com\/[a-z0-9-]+\/[a-f0-9-]+\/application/i,
    posting: /^https?:\/\/jobs\.ashbyhq\.com\/[a-z0-9-]+\/[a-f0-9-]+/i,
  },
};
```

### 10. Intent detector — `src/adapters/dom/intent/detector.ts`

```ts
import type { JobPostingData } from '../../../core/types/job-posting';
import { extractJobPostingFromDocument } from '../jd/jsonld-extractor';
import { URL_PATTERNS, type Ats } from './url-patterns';

export interface PageIntent {
  kind: 'job-posting' | 'application-form' | 'unknown';
  ats?: Ats;
  jobData?: JobPostingData;
}

/**
 * Classifies the current page by URL pattern and, for job postings,
 * opportunistically attaches parsed JSON-LD structured data.
 *
 * Never throws. Always returns a PageIntent.
 */
export function detectPageIntent(location: Location, doc: Document): PageIntent {
  const url = location.href;
  const atsOrder: readonly Ats[] = ['greenhouse', 'lever', 'workday', 'ashby'];

  for (const ats of atsOrder) {
    const { posting, form } = URL_PATTERNS[ats];
    if (form.test(url)) {
      return { kind: 'application-form', ats };
    }
    if (posting.test(url)) {
      const jobData = extractJobPostingFromDocument(doc) ?? undefined;
      return { kind: 'job-posting', ats, jobData };
    }
  }

  return { kind: 'unknown' };
}
```

## Acceptance criteria

- [ ] `applyHighlights(body, ['React', 'TypeScript'])` on a happy-dom fixture containing `<p>React and TypeScript rock.</p>` wraps both keywords in `<mark data-ats-autofill="true">` spans.
- [ ] Calling the cleanup function returned by `applyHighlights` restores `body.innerHTML` to its original value (modulo `normalize()`).
- [ ] Re-calling `applyHighlights` with a different keyword set first removes the earlier marks; only the new set's marks remain.
- [ ] Word-boundary respected: keyword `Java` does NOT match substring `JavaScript`.
- [ ] Case-insensitive: keyword `react` matches `React` and the returned match carries the original keyword string `react`.
- [ ] Overlap resolution: with keywords `React` and `React Native` both in the input, text `React Native` produces a single match of `React Native` (longest wins).
- [ ] An empty keyword array returns a no-op cleanup with no DOM mutation and no style injection.
- [ ] Text inside `<script>`, `<style>`, or `<noscript>` is never wrapped, even if it contains a keyword verbatim.
- [ ] `extractJobPostingFromDocument` handles top-level `JobPosting`, nested `@graph` arrays, multiple `<script type="application/ld+json">` elements, malformed JSON, and non-JobPosting types.
- [ ] `extractJobPostingFromDocument` returns `null` for pages without JSON-LD.
- [ ] `extractJobDescription` returns `{ method: 'jsonld', ... }` when JSON-LD is present and `{ method: 'readability', ... }` when readability succeeds on a fallback article fixture.
- [ ] `extractJobDescription` returns `null` when neither source yields usable text.
- [ ] `extractViaReadability` does not mutate the original `Document` (verified by snapshot comparison).
- [ ] `detectPageIntent` correctly identifies Greenhouse / Lever / Workday / Ashby URLs for both job-posting and application-form kinds, and returns `{ kind: 'unknown' }` for unrecognised URLs.
- [ ] `detectPageIntent` never throws, even for malformed URLs or pages with invalid JSON-LD.
- [ ] `detectPageIntent` attaches `jobData` to job-posting results when JSON-LD is present; `jobData` is `undefined` otherwise.
- [ ] All tests in `tests/adapters/dom/highlighter/**`, `tests/adapters/dom/jd/**`, `tests/adapters/dom/intent/**` pass under the right vitest environment.
- [ ] Zero references to `HighlightRange` anywhere in `src/adapters/dom/**`, `tests/adapters/dom/**`, or `dist/adapters/dom/**`.
- [ ] Zero imports from `core/highlight/**` (path does not exist).
- [ ] `grep -rn 'chrome\.' src/adapters/dom/highlighter src/adapters/dom/jd src/adapters/dom/intent` returns zero matches.
- [ ] `grep -rn 'console\.' src/adapters/dom/highlighter src/adapters/dom/jd src/adapters/dom/intent` returns zero matches.
- [ ] Bundle size check: the three new subtrees total < 35 KB gzipped (excluding the readability + turndown third-party bundles).

## Tests to write

### Pure (Node environment)

`tests/adapters/dom/highlighter/find-matches.spec.ts` — 15 cases minimum:

1. Empty text returns `[]`.
2. Empty keywords returns `[]`.
3. Single exact match returns a single entry with correct start/end.
4. Case-insensitive match preserves the original keyword.
5. Multiple matches of the same keyword in one string are all returned.
6. Word boundary rejects mid-word: `Java` vs `JavaScript`.
7. Text boundary treated as word boundary at start / end.
8. Punctuation neighbours count as boundaries.
9. Overlap resolution: longest wins on same start.
10. Non-overlapping adjacent matches are both retained.
11. Multi-word keyword matching.
12. Empty-string keywords are skipped.
13. Duplicate keywords do not double-emit at the same position.
14. Unicode pass-through (no crash on `café`).
15. Performance sanity: 10 KB text with 50 keywords under 50 ms.

### happy-dom environment

`tests/adapters/dom/highlighter/renderer.spec.ts` — at least 11 cases:

1. Happy path with two keywords.
2. Cleanup restores innerHTML exactly.
3. Idempotency: second call with different keywords clears the first set.
4. Word boundary: `Java` vs `JavaScript` produces zero marks.
5. Case-insensitive wrap.
6. Cross-node limitation documented: `dist<b>ributed</b>` with keyword `distributed` does NOT match (inline comment calls this out).
7. `<script>` / `<style>` contents skipped.
8. Pre-existing stray marks cleared on re-run.
9. Empty keyword array is a no-op (no style, no mutation).
10. Style element injected on first call, removed on cleanup.
11. Multiple matches in one text node all wrapped correctly.

`tests/adapters/dom/jd/jsonld-extractor.spec.ts` — at least 7 cases:

1. Top-level JobPosting returns normalised data.
2. JobPosting inside `@graph` returns it.
3. Multiple scripts, second one contains the posting, returns second.
4. Malformed JSON in one script does not abort the scan.
5. `hiringOrganization` as a string is normalised to `{ name }`.
6. No JSON-LD scripts at all returns `null`.
7. Non-JobPosting JSON-LD (e.g. WebPage) returns `null`.

`tests/adapters/dom/jd/readability-fallback.spec.ts` — at least 3 cases:

1. Article-like fixture yields non-empty markdown with expected heading and body.
2. No extractable content returns `null`.
3. Original document is not mutated by the extraction.

`tests/adapters/dom/intent/detector.spec.ts` — at least 20 cases across the four ATSes × `{posting, form, unknown}`, plus two extra cases verifying `jobData` attachment.

## Rollback plan

If any acceptance criterion fails and cannot be fixed in-flight:

1. Delete `src/adapters/dom/highlighter/`, `src/adapters/dom/jd/`, `src/adapters/dom/intent/` directories in full.
2. Revert `src/adapters/dom/index.ts` to the B5 state (strip the new re-exports only).
3. Revert `package.json` dependency additions (`@mozilla/readability`, `turndown`, `@joplin/turndown-plugin-gfm`, `@types/turndown`).
4. Revert `vitest.config.ts` `environmentMatchGlobs` changes.
5. No downstream impact on core — core never imported from these paths and no core files were modified.
6. Notify A9 that B6 is pending; A9 remains blocked.

## Out of scope

Explicitly NOT included in B6 (file issues for v1.1 if needed):

- Custom CSS theming — the highlight colour is a hard-coded yellow; theming is a v1.1 concern.
- Shadow DOM injection for stronger style isolation (v1.1).
- Unicode-aware word-boundary detection — the current ASCII heuristic matches the simplify.jobs / LinkedIn baseline; international scripts are v1.1.
- Cross-iframe highlighting — the renderer walks only the provided `root` and does not recurse into same-origin iframes (v1.1).
- Highlight category filtering (missing vs matched, per-skill category colours) — v1.1 will accept a richer structure; v1 ships a flat string list.
- Re-highlighting on SPA route changes via MutationObserver — A9 handles re-entry points, and v1 does not own any observer wiring.
- A core `HighlightRange` type or a `planHighlights` function — explicitly deleted in v2 per decision memo §2.5. Do NOT reintroduce.
- `extractSkills` / keyword matching inside the engine — explicitly server-only per decision memo §2.5 and §2.8.

## Compliance gates

Before marking this phase complete:

- [ ] `pnpm --filter ats-autofill-engine typecheck` passes.
- [ ] `pnpm --filter ats-autofill-engine lint` passes with zero warnings.
- [ ] `pnpm --filter ats-autofill-engine test tests/adapters/dom/highlighter/** tests/adapters/dom/jd/** tests/adapters/dom/intent/**` all green.
- [ ] `pnpm --filter ats-autofill-engine build` succeeds.
- [ ] `du -sh dist/adapters/dom/highlighter dist/adapters/dom/jd dist/adapters/dom/intent` totals under 35 KB gzipped.
- [ ] `grep -rn 'HighlightRange' src/adapters/dom tests/adapters/dom` returns zero matches.
- [ ] `grep -rn "from '.*core/highlight" src/adapters/dom tests/adapters/dom` returns zero matches.
- [ ] `grep -rn 'chrome\.' src/adapters/dom/highlighter src/adapters/dom/jd src/adapters/dom/intent` returns zero matches.
- [ ] `grep -rn 'console\.' src/adapters/dom/highlighter src/adapters/dom/jd src/adapters/dom/intent` returns zero matches.
- [ ] `src/adapters/dom/index.ts` re-exports the new surface and B5's existing exports are untouched.
- [ ] A9's consumer contract is verified: A9 calls `applyHighlights(document.body, keywordStrings: string[])`. Any remaining drift (e.g. passing a `HighlightRange[]`) is flagged to the architect for an A9 rewrite pass — do not patch A9 from inside B6.
