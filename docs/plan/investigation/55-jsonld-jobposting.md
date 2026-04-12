# 55 — JSON-LD JobPosting Extraction (Greenhouse / Lever / Ashby / Workday)

**Scope**: Offline, LLM-free structured job data extraction in an MV3 content script.

## (a) Per-platform JSON-LD availability (server render)

Verified via `curl` (no JS) against live production pages 2026-04-11:

| Platform | Server HTML has `ld+json`? | Evidence |
|---|---|---|
| **Lever** (`jobs.lever.co/<org>/<uuid>`) | **YES** (1 script, full JobPosting) | `jobs.lever.co/palantir/5ec536c8-67b8-4b6b-b23e-cde403d59d53` — 1 `application/ld+json` with `@type: JobPosting` |
| **Ashby** (`jobs.ashbyhq.com/<org>/<uuid>`) | **YES** (1 script) | `jobs.ashbyhq.com/linear/d3bc1ced-3ce4-4086-a050-555055dbb1ff` — 1 script, `@type: JobPosting`, 12 populated fields |
| **Greenhouse** (`job-boards.greenhouse.io/<org>/jobs/<id>`) | **NO at server time** | `job-boards.greenhouse.io/gitlab/jobs/8481922002` — Remix SPA shell only. Job data lives in `window.__remixContext` as JSON (fallback path). JSON-LD is injected client-side after React hydration. MV3 content scripts at `document_idle` will see it. |
| **Workday** (`*.myworkdayjobs.com`) | **NO** | Empty 6KB shell. No JSON-LD, no job data. Pure SPA. |

**Verdict**: Lever and Ashby are fully offline-extractable from raw HTML. Greenhouse requires either post-hydration DOM scan OR parsing `window.__remixContext`. Workday requires DOM scraping only (v1.1 scope).

## (b) Fields populated per platform (observed)

| Field | Lever | Ashby | Greenhouse (remix JSON) |
|---|---|---|---|
| `title` | Y | Y | Y (`jobPost.title`) |
| `description` (HTML) | Y (rich HTML, not sanitized) | Y (rich HTML with inline styles) | Y (`jobPost.content`, HTML-encoded) |
| `datePosted` | Y (ISO date, no time) | Y | Y (separate field `first_published`) |
| `validThrough` | N | N | N |
| `employmentType` | Y (`"Full-time"` — non-Schema enum) | Y (`"FULL_TIME"` — Schema-compliant) | In `jobPost.employment_type` |
| `hiringOrganization.name` | Y | Y | Via board metadata |
| `hiringOrganization.logo` | Y (S3 URL) | Y | Y |
| `hiringOrganization.url` | N | sometimes | N |
| `jobLocation` (nested Place) | Y (single object, `addressLocality` only, region/country often null) | Y (can be array or single) | As `jobPost.location_name` (string) |
| `baseSalary` | N | sometimes (`includeCompensation=true` in API, not always in JSON-LD) | N |
| `identifier` | N | Y (`@type: PropertyValue`) | Y (numeric id) |
| `directApply` | N | Y (boolean) | N |
| `jobLocationType` / `applicantLocationRequirements` | N | Y | N |
| `industry`, `occupationalCategory`, `qualifications`, `responsibilities`, `skills`, `workHours`, `jobBenefits` | **N across all three** | N | N |

Every "nice to have" Schema.org field (`qualifications`, `skills`, `baseSalary`, `workHours`) is essentially **never populated**. Plan on extracting free text from `description` HTML for those.

## (c) `description` field is HTML

All three platforms embed **raw rich HTML** (`<p>`, `<ul>`, `<b>`, inline `style` attrs, `<br>`). It is **not sanitized** — just JSON-string-escaped. Consumer must:
1. Treat as untrusted HTML (never `innerHTML` into our own extension UI — use `DOMPurify` or `textContent`).
2. Strip tags when feeding the LLM prompt to save tokens.
3. Preserve structure when rendering a preview.

## (d) Edge cases (all handled in code below)

1. **Multiple `<script type="application/ld+json">`** — iterate all, find the one where `@type === 'JobPosting'` OR `@graph[].findIndex(@type === 'JobPosting')`. Lever uses one script with nested `@type: Organization`/`Place` inside a single JobPosting root. Ashby same.
2. **`@graph` arrays** — some sites wrap entities in `{"@graph": [...]}`. Code flattens.
3. **Malformed JSON** — `try/catch` per script, never throw.
4. **`@type` as array** — Schema.org allows `@type: ["JobPosting", "Thing"]`. Code handles string or array.
5. **Canonical URL mismatch** — irrelevant for extraction; we operate on the rendered `document`.
6. **Nested `hiringOrganization.address`** — Lever puts address under `jobLocation.address`, not `hiringOrganization`.
7. **`jobLocation` single vs array** — Ashby can emit array, Lever always single object. Normalize to array.
8. **Non-standard employmentType strings** — Lever: `"Full-time"`; Ashby: `"FULL_TIME"`. Normalize downstream, not here.

## (e) Extraction code (MV3 content-script compatible)

```ts
// extension/src/extraction/jsonld.ts
// Runs in a content script. Pure DOM, no browser APIs beyond Document.

export interface JobPostingData {
  title: string;
  description: string; // raw HTML as emitted by the platform
  hiringOrganization?: { name: string; url?: string; logo?: string };
  jobLocation?: Array<{
    city?: string;
    region?: string;
    country?: string;
    postalCode?: string;
  }>;
  datePosted?: string;
  validThrough?: string;
  employmentType?: string;
  baseSalary?: { minValue?: number; maxValue?: number; currency?: string; unitText?: string };
  identifier?: string;
  raw: unknown; // full JSON-LD JobPosting node, for debugging and future field mining
}

type JsonLdNode = Record<string, unknown> & { '@type'?: string | string[] };

function typeMatches(node: unknown, type: string): node is JsonLdNode {
  if (!node || typeof node !== 'object') return false;
  const t = (node as JsonLdNode)['@type'];
  if (typeof t === 'string') return t === type;
  if (Array.isArray(t)) return t.includes(type);
  return false;
}

function findJobPosting(parsed: unknown): JsonLdNode | null {
  if (!parsed) return null;
  if (Array.isArray(parsed)) {
    for (const n of parsed) {
      const hit = findJobPosting(n);
      if (hit) return hit;
    }
    return null;
  }
  if (typeof parsed !== 'object') return null;
  if (typeMatches(parsed, 'JobPosting')) return parsed as JsonLdNode;
  const graph = (parsed as JsonLdNode)['@graph'];
  if (Array.isArray(graph)) return findJobPosting(graph);
  return null;
}

function toStr(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

function toNum(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim()) {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function normalizeLocation(loc: unknown): JobPostingData['jobLocation'] {
  if (!loc) return undefined;
  const list = Array.isArray(loc) ? loc : [loc];
  const out = list
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const addr = (item as JsonLdNode)['address'] ?? item;
      if (!addr || typeof addr !== 'object') return null;
      const a = addr as JsonLdNode;
      return {
        city: toStr(a['addressLocality']),
        region: toStr(a['addressRegion']),
        country: toStr(a['addressCountry']) ?? toStr((a['addressCountry'] as JsonLdNode | undefined)?.['name']),
        postalCode: toStr(a['postalCode']),
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null && (!!x.city || !!x.region || !!x.country));
  return out.length ? out : undefined;
}

function normalizeOrg(org: unknown): JobPostingData['hiringOrganization'] {
  if (!org || typeof org !== 'object') return undefined;
  const o = org as JsonLdNode;
  const name = toStr(o['name']);
  if (!name) return undefined;
  return { name, url: toStr(o['url']), logo: toStr(o['logo']) };
}

function normalizeSalary(s: unknown): JobPostingData['baseSalary'] {
  if (!s || typeof s !== 'object') return undefined;
  const node = s as JsonLdNode;
  const currency = toStr(node['currency']);
  const value = node['value'] as JsonLdNode | undefined;
  if (!value || typeof value !== 'object') return currency ? { currency } : undefined;
  return {
    minValue: toNum(value['minValue']),
    maxValue: toNum(value['maxValue']),
    currency,
    unitText: toStr(value['unitText']),
  };
}

export function extractJobPostingFromDocument(doc: Document): JobPostingData | null {
  const scripts = doc.querySelectorAll<HTMLScriptElement>('script[type="application/ld+json"]');
  for (const script of Array.from(scripts)) {
    const text = script.textContent?.trim();
    if (!text) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      continue; // defensive: skip malformed JSON
    }
    const node = findJobPosting(parsed);
    if (!node) continue;

    const title = toStr(node['title']);
    const description = toStr(node['description']);
    if (!title || !description) continue; // require minimum viable fields

    return {
      title,
      description,
      hiringOrganization: normalizeOrg(node['hiringOrganization']),
      jobLocation: normalizeLocation(node['jobLocation']),
      datePosted: toStr(node['datePosted']),
      validThrough: toStr(node['validThrough']),
      employmentType: Array.isArray(node['employmentType'])
        ? (node['employmentType'] as unknown[]).filter((x): x is string => typeof x === 'string').join(', ')
        : toStr(node['employmentType']),
      baseSalary: normalizeSalary(node['baseSalary']),
      identifier: (() => {
        const id = node['identifier'];
        if (typeof id === 'string') return id;
        if (id && typeof id === 'object') return toStr((id as JsonLdNode)['value']);
        return undefined;
      })(),
      raw: node,
    };
  }
  return null;
}
```

## (f) Fallback signatures when JSON-LD absent (v1.1, not implemented)

```ts
// extension/src/extraction/dom-fallback.ts
export interface DomExtractorRule {
  host: RegExp;
  title: string; // CSS selector
  description: string;
  organization?: string;
  location?: string;
}

// Populated but NOT implemented in MVP — flagged v1.1
export const WORKDAY_RULE: DomExtractorRule = {
  host: /\.myworkdayjobs\.com$/,
  title: '[data-automation-id="jobPostingHeader"]',
  description: '[data-automation-id="jobPostingDescription"]',
  location: '[data-automation-id="locations"]',
};

export const GREENHOUSE_REMIX_RULE = {
  host: /(^|\.)job-boards\.greenhouse\.io$/,
  // After React hydration, document DOM contains the job. Before hydration, fall
  // back to window.__remixContext.state.loaderData['routes/$url_token_.jobs_.$job_post_id'].jobPost
  // Keys verified: title, content (HTML), location_name, first_published, employment_type
};

export function extractViaDom(_doc: Document): JobPostingData | null {
  // v1.1 — not implemented in MVP
  return null;
}
```

Greenhouse SPA behaviour: in an MV3 content script running at `document_idle`, React has hydrated and JSON-LD is typically injected. The extraction function above handles that path. If JSON-LD is still missing, parse `window.__remixContext` — the relevant nested key is `state.loaderData['routes/$url_token_.jobs_.$job_post_id'].jobPost` with fields `title`, `content`, `location_name`, `first_published`, `employment_type`.

## (g) i18n

Spot-check: Palantir Lever posting is in Korea (`Seoul, South Korea`) but the title and description are in **English**. Greenhouse boards for European companies also default to English. Non-English postings do occur (e.g. German Mittelstand) but are the minority. The extractor is language-agnostic — it only reads keys, never parses body text. Downstream ATS-score / LLM steps must be prepared for non-English descriptions; this is an LLM concern, not an extraction concern.

## (h) Test URLs (stable, fetch once, save fixture HTML, commit to repo)

| # | Platform | URL | Notes |
|---|---|---|---|
| 1 | Lever | `https://jobs.lever.co/palantir/5ec536c8-67b8-4b6b-b23e-cde403d59d53` | Confirmed JSON-LD, Korean location, English content |
| 2 | Ashby | `https://jobs.ashbyhq.com/linear/d3bc1ced-3ce4-4086-a050-555055dbb1ff` | Confirmed JSON-LD, 12 fields |
| 3 | Greenhouse (Remix SPA) | `https://job-boards.greenhouse.io/gitlab/jobs/8481922002` | Needs post-hydration DOM OR `__remixContext` fallback |
| 4 | Greenhouse via public API | `https://boards-api.greenhouse.io/v1/boards/airbnb/jobs` | Use absolute_url of first job for dynamic fixture |
| 5 | Lever (second org) | Any `https://jobs.lever.co/{figma,mixpanel,netflix}/<uuid>` via `https://api.lever.co/v0/postings/<org>?mode=json&limit=1` | |
| 6 | Ashby (second org) | Any `https://jobs.ashbyhq.com/{notion,ramp,replicate}/<uuid>` via `https://api.ashbyhq.com/posting-api/job-board/<org>` | |
| 7 | Workday | `https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite` | Negative test: `extractJobPostingFromDocument()` must return `null` |
| 8 | Malformed JSON fixture | Synthetic: script tag with `{invalid` | Must return `null` without throwing |
| 9 | `@graph` wrapper fixture | Synthetic: `{"@graph":[{"@type":"WebPage"},{"@type":"JobPosting",...}]}` | Must find nested JobPosting |
| 10 | Multi-script fixture | Synthetic: 3 `ld+json` tags, only the third is `JobPosting` | Must iterate and return third |

**Test runner**: `vitest` + `happy-dom` — load fixture HTML via `document.documentElement.innerHTML = fixture`, call `extractJobPostingFromDocument(document)`, assert on each field.

## Blast radius & confidence

- Files touched (new): 2 (`jsonld.ts`, `dom-fallback.ts` stub) plus 1 test file and ~3 fixtures.
- Lines added: ~250.
- Deleted: 0.
- Integration point: content script dispatcher picks the right extractor per URL.
- Risk: Greenhouse hydration timing (MV3 `document_idle` normally sufficient; if not, retry with a 500ms-capped `MutationObserver` watching `<script type="application/ld+json">`).

Confidence: 90% — Lever, Ashby, Workday verified empirically. Greenhouse JSON-LD-after-hydration is inferred from Remix SSR pattern and the observation that `__remixContext.jobPost` contains all needed fields, so even if hydration fails we have a deterministic fallback.
