# 48 - Keyword Highlight Algorithm

## Scope Declaration
- Files: 1 investigation doc
- Lines: ~420
- Confidence: 88%

## 1. Feature Disambiguation

The Zovo deal listed "keyword highlighting" as a DOM feature alongside form detection and autofill. The user-facing purpose was unspecified. Four candidate behaviours, scored on Value / Offline Feasibility / Novelty / Screenshot appeal (1-5):

| # | Behaviour | Value | Offline | Novelty | Screenshot | Total |
|---|-----------|-------|---------|---------|------------|-------|
| a | JD -> visual highlight of extracted keywords | 3 | 5 | 2 | 4 | 14 |
| b | **Gap analysis: JD keywords MISSING from profile** | **5** | **5** | **4** | **5** | **19** |
| c | Answer-time validation (type in form, match JD) | 4 | 4 | 4 | 3 | 15 |
| d | Coverage: JD keywords PRESENT in profile | 4 | 5 | 3 | 4 | 16 |

**Pick (b) as primary, (d) as secondary toggle.** Rationale:
- **Gap** is the single highest-leverage insight an applicant can get in the 30 seconds they look at a JD. It answers "should I even apply, and what do I edit first?"
- Simplify.jobs highlights skills on Indeed/LinkedIn cards but does NOT cross-reference against the user's stored resume. That gap is the wedge.
- Render both modes from the same pass: colour missing in amber, present in green. Marketing screenshot is self-explanatory (red = gap, green = match, grey = neutral skill).
- Fully offline once taxonomy + profile skill set are cached in `chrome.storage.local`.

Answer-time validation (c) defers to v2 -- it needs keystroke hooks and form-field focus tracking that belong in the autofill pipeline, not the highlighter.

## 2. Skill Taxonomy Data Source

Four candidates evaluated:

| Source | Size | License | Coverage | Bundled? |
|--------|------|---------|----------|----------|
| `skill-taxonomy` (Ebenezer's own, v3.0.1) | ~14,750 skills | Private GH, usable | Tech + soft | YES |
| ESCO v1.2 | ~13,890 skills, ~7 MB JSON | EU open data, CC-BY | Pan-EU, multilingual | No (too large) |
| O*NET 28.3 | ~35,000 elements, ~15 MB | Public domain | US occupations | No (too large) |
| LinkedIn skill list | N/A | Proprietary, scraped | Best coverage | No (legal) |

**Decision: ship `skill-taxonomy` v3.0.1.**

The backend (`api/src/modules/ats/services/keyword-scorer.service.ts`) already imports `{ AhoCorasickAutomaton, buildAutomaton } from 'skill-taxonomy'`. Reusing it gives offline parity with server-side ATS scoring and zero behavioural drift between extension and web app.

**Bundled size budget:**
- Taxonomy JSON (skill -> canonicalId + aliases): est. 180-280 KB gzipped
- Aho-Corasick automaton: built at extension install time in a service worker and persisted to `chrome.storage.local` as a compact goto/fail/output table (est. 350-500 KB)
- Soft cap: **500 KB** total for the highlight module, enforced in bundle-size CI gate

If the taxonomy exceeds 500 KB compressed, ship a **curated subset** (top 5000 tech + 2000 soft skills covering ~95% of real JDs per backend telemetry).

## 3. Keyword Extraction Algorithm (offline, no LLM)

**Hybrid: Aho-Corasick primary, frequency fallback for uncovered phrases.**

Rejected alternatives:
- Naive frequency: too noisy, surfaces "candidate / experience / team"
- TF-IDF: needs shipped corpus stats, only marginally better than frequency
- Noun-phrase regex: brittle, English-only, misses "CI/CD" and "GraphQL"

### Algorithm

```
1. Normalize JD text: lowercase, collapse whitespace, strip control chars
2. Aho-Corasick scan over taxonomy -> raw matches { canonicalId, start, end, surface }
3. Overlap resolution: longest-match-wins (prefer "machine learning" over "machine")
4. Section weighting: requirements/must-have = 2.0x, nice-to-have = 0.5x,
   first paragraph = 1.3x (titles and summaries matter more)
5. Frequency boost: count distinct occurrences, apply log(1 + count)
6. Score = (sectionWeight * log(1+freq)) per canonicalId
7. Category tagging from taxonomy metadata: tech / soft / tool / cert / language
8. Rank by score, keep top 40 (UI cap)
9. For uncovered top-5 phrases: run a bigram/trigram frequency pass with stop-word
   filter, mark as category='uncategorized', low confidence
```

### Gap Analysis Overlay

```
profileSkills: Set<canonicalId>   // cached from user's stored resume
for each extractedKeyword:
  status = profileSkills.has(canonicalId) ? 'match' : 'gap'
```

Profile skill set is built once when the user connects their resume (we already parse this server-side during onboarding) and pushed to the extension via the existing auth bridge, then cached locally. Refreshed on resume update events.

## 4. Rendering Algorithm

### Constraints
- **Idempotent**: re-running on an already-highlighted DOM is a no-op
- **Reversible**: single cleanup function removes all marks without DOM diff residue
- **Non-destructive**: never modifies attributes or event handlers on host elements
- **Performance**: 10 KB JD < 50 ms extract, 100 KB page < 100 ms render, wrapped in `requestIdleCallback`

### DOM Walking

```
1. TreeWalker(root, NodeFilter.SHOW_TEXT) skipping:
   - <script>, <style>, <noscript>, <textarea>, <input>
   - Nodes inside existing .llmc-kw-mark (idempotency guard)
   - Contenteditable regions (don't fight the user's own editing)
2. Build flat array: { node, text, absoluteOffset }
3. Run the same Aho-Corasick pass over the concatenated text
4. Map match offsets back to individual text nodes (may split across nodes)
5. For each intra-node match, Range.surroundContents with a <mark> element
6. For cross-node matches, split at boundaries and wrap each fragment
```

### Mark Element

```html
<mark class="llmc-kw-mark"
      data-llmc-kw="react"
      data-llmc-status="match">React</mark>
```

- `data-llmc-kw`: canonical skill id (for hover tooltip + click-to-explain)
- `data-llmc-status`: `match` | `gap` | `neutral`
- Class prefix `llmc-` avoids clashes with host CSS

### Overlap Handling

Pre-rendering, sort matches by `(start asc, length desc)`, sweep-drop any whose range intersects an already-kept match. Guarantees longest-match-wins and zero overlapping `<mark>` elements.

### Cleanup Function

`applyHighlightsToDom` returns `() => void` that calls `querySelectorAll('.llmc-kw-mark')`, replaces each mark with its text node via `node.replaceWith(node.textContent)`, then normalises the parent to coalesce adjacent text nodes.

## 5. CSS Isolation

**Decision: injected stylesheet with all-inherit reset, NOT shadow DOM.**

Shadow DOM breaks text selection across mark boundaries and prevents the host page's native find-in-page from seeing the original text. Injected style with high specificity and a prefixed class is the standard extension approach:

```css
mark.llmc-kw-mark {
  all: unset;
  background: var(--llmc-kw-bg, #fff3bf);
  color: inherit;
  border-bottom: 2px solid var(--llmc-kw-border, #f59f00);
  border-radius: 2px;
  padding: 0 1px;
  cursor: help;
}
mark.llmc-kw-mark[data-llmc-status="match"] {
  --llmc-kw-bg: #d3f9d8;
  --llmc-kw-border: #2f9e44;
}
mark.llmc-kw-mark[data-llmc-status="gap"] {
  --llmc-kw-bg: #ffe3e3;
  --llmc-kw-border: #e03131;
}
```

CSS variables allow per-user theme override from the extension popup.

## 6. Locked API Shape

```ts
// @llmc/autofill-core (pure, no DOM)
export interface Keyword {
  readonly canonicalId: string;
  readonly surface: string;
  readonly score: number;
  readonly category: 'tech' | 'soft' | 'tool' | 'cert' | 'language' | 'uncategorized';
  readonly status: 'match' | 'gap' | 'neutral';
  readonly occurrences: readonly { start: number; end: number }[];
}

export interface Taxonomy {
  readonly version: string;
  readonly automaton: AhoCorasickAutomaton;
  readonly metadata: ReadonlyMap<string, { category: Keyword['category']; canonical: string }>;
}

export interface HighlightPlan {
  readonly keywords: readonly Keyword[];
  // absolute character offsets across the concatenated text of the root
  readonly ranges: readonly { start: number; end: number; canonicalId: string; status: Keyword['status'] }[];
}

export function extractKeywords(
  jdText: string,
  taxonomy: Taxonomy,
  profileSkills: ReadonlySet<string>,
): readonly Keyword[];

export function planHighlights(
  keywords: readonly Keyword[],
  concatenatedText: string,
): HighlightPlan;

// @llmc/autofill-dom (browser adapter)
export function applyHighlightsToDom(
  root: Element,
  plan: HighlightPlan,
): () => void;  // cleanup
```

## 7. Performance Budget

| Operation | Budget | Strategy |
|-----------|--------|----------|
| Taxonomy load (cold) | < 300 ms | Deserialise from `chrome.storage.local` on service worker boot, cache in memory |
| extractKeywords 10 KB JD | < 50 ms | Aho-Corasick is O(n + m + k); ~0.5 MB/ms on V8 |
| planHighlights | < 20 ms | Single linear sort + sweep |
| applyHighlightsToDom 100 KB page | < 100 ms | TreeWalker + Range API, wrapped in `requestIdleCallback(..., { timeout: 200 })` |
| Cleanup | < 30 ms | `querySelectorAll` + `replaceWith` loop |

All timings measured via `performance.now()` and reported to the extension's internal telemetry ring buffer (not network) for regression detection.

## 8. Locked Algorithm Summary

1. Ship `skill-taxonomy` v3.0.1 bundled under 500 KB
2. Feature = **gap analysis** primary, coverage toggle secondary
3. Extraction = Aho-Corasick + longest-match + section weighting + log-freq, top 40
4. Rendering = TreeWalker + Range.surroundContents + prefixed `<mark>`, idempotent + reversible
5. CSS = injected stylesheet with `all: unset` reset, CSS vars for themes
6. API = `extractKeywords`, `planHighlights`, `applyHighlightsToDom` as above

## Confidence: 88%
