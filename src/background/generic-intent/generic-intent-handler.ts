// SPDX-License-Identifier: MIT
/**
 * GENERIC_INTENT_DETECT handler. Uses chrome.scripting.executeScript to
 * inject the scan function against the target tab and returns the
 * normalized JD / company result to the caller.
 *
 * NOTE: `scanForGenericIntent` is defined INLINE here rather than imported
 * from `@/src/content/generic-scan`. The cross-import triggered Vite to
 * share a chunk between the SW and the content bundle, and that chunk
 * included `__vitePreload` which references `document` at the top of the
 * chunk factory. Service workers have no `document`, so the SW crashed at
 * module load. Keeping the scan function inline here isolates the SW
 * from any content-script-bound code.
 */

import type { Logger } from '../log';
import {
  GenericIntentDetectRequestSchema,
  GenericIntentDetectResponseSchema,
  type GenericIntentDetectResponse,
} from '../messaging/schemas/generic-intent.schema';

export type GenericScanAgent = 'job-hunter' | 'b2b-sales';

export interface GenericScanJdResult {
  readonly kind: 'job-description';
  readonly text: string;
  readonly method: 'jsonld' | 'readability';
  readonly jobTitle?: string;
  readonly company?: string;
  readonly url: string;
}

export interface GenericScanCompanyResult {
  readonly kind: 'company-page';
  readonly url: string;
  readonly signals: readonly (
    | 'jsonld-organization'
    | 'about-link'
    | 'contact-link'
    | 'corp-host'
  )[];
  readonly companyName?: string;
}

export type GenericScanResult =
  | { readonly ok: true; readonly result: GenericScanJdResult | GenericScanCompanyResult }
  | { readonly ok: false; readonly reason: 'no-match' };

/**
 * Self-contained scan function executed in the target tab via
 * chrome.scripting.executeScript. Must not reference any outer binding
 * except its argument list.
 */
function scanForGenericIntent(agent: GenericScanAgent): GenericScanResult {
  const MAX_TEXT = 20_000;

  // Never scan our own surfaces. Without this guard, the URL heuristic
  // (see hasJobPostingMarkers) falsely fires on job-hunt.llmconveyors.com
  // because the hostname contains the substring "job".
  const currentUrl = document.location?.href ?? '';
  const currentHost = (() => {
    try {
      return new URL(currentUrl).hostname;
    } catch {
      return '';
    }
  })();
  if (
    currentUrl.startsWith('chrome-extension://') ||
    currentUrl.startsWith('chrome://') ||
    currentUrl.startsWith('about:') ||
    currentHost === 'llmconveyors.com' ||
    currentHost.endsWith('.llmconveyors.com')
  ) {
    return { ok: false, reason: 'no-match' };
  }

  function findJsonLdObjects(doc: Document): unknown[] {
    const nodes = doc.querySelectorAll('script[type="application/ld+json"]');
    const out: unknown[] = [];
    for (const node of Array.from(nodes)) {
      const txt = node.textContent;
      if (!txt) continue;
      try {
        const parsed: unknown = JSON.parse(txt);
        if (Array.isArray(parsed)) out.push(...parsed);
        else out.push(parsed);
      } catch {
        // malformed JSON-LD block -- skip
      }
    }
    return out;
  }

  function extractJobPosting(objs: readonly unknown[]):
    | { title?: string; company?: string; description: string }
    | null {
    for (const raw of objs) {
      if (!raw || typeof raw !== 'object') continue;
      const obj = raw as Record<string, unknown>;
      const type = obj['@type'];
      const isJobPosting =
        (typeof type === 'string' && type === 'JobPosting') ||
        (Array.isArray(type) && type.includes('JobPosting'));
      if (!isJobPosting) continue;
      const description = typeof obj.description === 'string' ? obj.description : '';
      if (description.trim().length === 0) continue;
      const title = typeof obj.title === 'string' ? obj.title : undefined;
      const org = obj.hiringOrganization;
      const company =
        org && typeof org === 'object' && typeof (org as Record<string, unknown>).name === 'string'
          ? ((org as Record<string, unknown>).name as string)
          : undefined;
      return {
        title,
        company,
        description: description.slice(0, MAX_TEXT),
      };
    }
    return null;
  }

  function textViaReadability(doc: Document): string {
    // Heuristic: try targeted JD containers first (matches what Meta,
    // Lever, Greenhouse, Ashby, Workday, LinkedIn Jobs use), then fall
    // back to article/main/body. Score candidates by length and pick
    // the longest viable match. Meta's `metacareers.com` is a React
    // SPA where the JD lives inside a div with no semantic tag, so a
    // naive `main ?? body` scoop only grabbed the footer-adjacent
    // text, producing 1k-char extractions for 4k-char job posts.
    const selectors: readonly string[] = [
      '[data-testid*="job-description" i]',
      '[data-testid*="jobDescription" i]',
      '[data-testid*="job-detail" i]',
      '[class*="jobDescription" i]',
      '[class*="job-description" i]',
      '[class*="job_description" i]',
      '[id*="jobDescription" i]',
      '[id*="job-description" i]',
      '[data-automation-id*="jobPostingDescription" i]', // Workday
      '.posting-requirements', // Lever
      '.section-wrapper', // Greenhouse / some job boards
      '[role="main"]',
      'main article',
      'main',
      'article',
    ];
    const candidates: string[] = [];
    for (const sel of selectors) {
      let el: Element | null = null;
      try {
        el = doc.querySelector(sel);
      } catch {
        continue; // Invalid selector in some DOMs; skip.
      }
      if (!el) continue;
      const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
      if (text.length >= 300) candidates.push(text);
    }
    // Last-resort body scoop so we never return empty when SOMETHING
    // is on the page.
    if (candidates.length === 0 && doc.body) {
      const bodyText = (doc.body.textContent ?? '')
        .replace(/\s+/g, ' ')
        .trim();
      if (bodyText.length >= 300) candidates.push(bodyText);
    }
    if (candidates.length === 0) return '';
    // Longest match wins (caps at MAX_TEXT to bound response size).
    candidates.sort((a, b) => b.length - a.length);
    return candidates[0]!.slice(0, MAX_TEXT);
  }

  function normalizeText(input: string): string {
    return input.replace(/\s+/g, ' ').trim();
  }

  function clampHint(input: string, max: number): string | undefined {
    const normalized = normalizeText(input);
    if (normalized.length < 2) return undefined;
    return normalized.slice(0, max);
  }

  function cleanCompany(raw: string): string | undefined {
    let normalized = normalizeText(raw);
    normalized = normalized
      .replace(/\b(careers?|jobs?|job postings?|job board)\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (normalized.length < 2) return undefined;
    return normalized.slice(0, 120);
  }

  function parseTitleCompanyPair(source: string): {
    jobTitle?: string;
    company?: string;
  } {
    const text = normalizeText(source);
    if (!text) return {};

    // Common pattern: "Senior Engineer at Acme" or "Senior Engineer @ Acme"
    const atMatch = text.match(/^(.+?)\s+(?:at|@)\s+(.+)$/i);
    if (atMatch) {
      return {
        jobTitle: clampHint(atMatch[1] ?? '', 160),
        company: cleanCompany(atMatch[2] ?? ''),
      };
    }

    // Common pattern: "Senior Engineer - Acme" / "| Acme"
    const split = text.split(/\s*(?:\||-)\s*/).filter((part) => part.length > 0);
    if (split.length >= 2) {
      const left = clampHint(split[0] ?? '', 160);
      const rightRaw = split[1] ?? '';
      const rightLooksPortal = /\b(careers?|jobs?|hiring|workday|greenhouse|lever|linkedin)\b/i.test(
        rightRaw,
      );
      return {
        ...(left ? { jobTitle: left } : {}),
        ...(!rightLooksPortal
          ? (() => {
              const company = cleanCompany(rightRaw);
              return company ? { company } : {};
            })()
          : {}),
      };
    }

    return { jobTitle: clampHint(text, 160) };
  }

  function extractJobHints(
    doc: Document,
    objs: readonly unknown[],
  ): { jobTitle?: string; company?: string } {
    let jobTitle: string | undefined;
    let company: string | undefined;

    for (const raw of objs) {
      if (!raw || typeof raw !== 'object') continue;
      const obj = raw as Record<string, unknown>;
      const type = obj['@type'];
      const isJobPosting =
        (typeof type === 'string' && type === 'JobPosting') ||
        (Array.isArray(type) && type.includes('JobPosting'));
      if (!isJobPosting) continue;
      if (!jobTitle && typeof obj.title === 'string') {
        jobTitle = clampHint(obj.title, 160);
      }
      const org = obj.hiringOrganization;
      if (
        !company &&
        org &&
        typeof org === 'object' &&
        typeof (org as Record<string, unknown>).name === 'string'
      ) {
        company = cleanCompany((org as Record<string, unknown>).name as string);
      }
      if (jobTitle && company) break;
    }

    if (!company) {
      for (const raw of objs) {
        if (!raw || typeof raw !== 'object') continue;
        const obj = raw as Record<string, unknown>;
        const type = obj['@type'];
        const isOrg =
          (typeof type === 'string' && type === 'Organization') ||
          (Array.isArray(type) && type.includes('Organization'));
        if (!isOrg) continue;
        if (typeof obj.name === 'string') {
          company = cleanCompany(obj.name);
          if (company) break;
        }
      }
    }

    const getMeta = (selector: string): string | undefined => {
      const node = doc.querySelector(selector);
      if (!node) return undefined;
      const content = node.getAttribute('content');
      if (!content) return undefined;
      return normalizeText(content);
    };

    const candidates: string[] = [];
    const h1 = doc.querySelector('h1')?.textContent;
    if (typeof h1 === 'string' && h1.trim().length > 0) candidates.push(h1);
    const ogTitle = getMeta('meta[property="og:title"]');
    if (ogTitle) candidates.push(ogTitle);
    const twTitle = getMeta('meta[name="twitter:title"]');
    if (twTitle) candidates.push(twTitle);
    if (typeof doc.title === 'string' && doc.title.trim().length > 0) {
      candidates.push(doc.title);
    }

    for (const candidate of candidates) {
      const parsed = parseTitleCompanyPair(candidate);
      if (!jobTitle && parsed.jobTitle) jobTitle = parsed.jobTitle;
      if (!company && parsed.company) company = parsed.company;
      if (jobTitle && company) break;
    }

    if (!company) {
      const siteName = getMeta('meta[property="og:site_name"]');
      if (siteName) company = cleanCompany(siteName);
    }

    return {
      ...(jobTitle ? { jobTitle } : {}),
      ...(company ? { company } : {}),
    };
  }

  function hasJobPostingMarkers(doc: Document): boolean {
    const url = doc.location?.href ?? '';
    if (/careers|jobs|job-description|apply/i.test(url)) return true;
    const title = (doc.title ?? '').toLowerCase();
    if (/\b(apply|careers?|job)\b/.test(title)) return true;
    return false;
  }

  function detectCompanySignals(doc: Document): {
    signals: GenericScanCompanyResult['signals'];
    companyName?: string;
  } {
    const signals: Array<'jsonld-organization' | 'about-link' | 'contact-link' | 'corp-host'> = [];
    let companyName: string | undefined;
    const objs = findJsonLdObjects(doc);
    for (const raw of objs) {
      if (!raw || typeof raw !== 'object') continue;
      const obj = raw as Record<string, unknown>;
      const type = obj['@type'];
      const isOrg =
        (typeof type === 'string' && type === 'Organization') ||
        (Array.isArray(type) && type.includes('Organization'));
      if (!isOrg) continue;
      signals.push('jsonld-organization');
      if (typeof obj.name === 'string') {
        companyName = obj.name;
      }
      break;
    }
    const anchors = Array.from(doc.querySelectorAll('a[href]'));
    const hasAbout = anchors.some((a) => {
      const href = (a.getAttribute('href') ?? '').toLowerCase();
      const text = (a.textContent ?? '').toLowerCase();
      return /\/about(\/|$)/.test(href) || text.trim() === 'about';
    });
    const hasContact = anchors.some((a) => {
      const href = (a.getAttribute('href') ?? '').toLowerCase();
      const text = (a.textContent ?? '').toLowerCase();
      return /\/contact(\/|$)/.test(href) || text.trim() === 'contact';
    });
    if (hasAbout) signals.push('about-link');
    if (hasContact) signals.push('contact-link');
    try {
      const host = new URL(doc.location?.href ?? '').hostname.replace(/^www\./, '');
      const consumerHosts = new Set([
        'google.com',
        'facebook.com',
        'instagram.com',
        'twitter.com',
        'x.com',
        'tiktok.com',
        'reddit.com',
        'youtube.com',
        'linkedin.com',
      ]);
      if (host.length > 0 && !consumerHosts.has(host) && host.split('.').length <= 3) {
        signals.push('corp-host');
      }
    } catch {
      // ignore
    }
    return { signals, companyName };
  }

  const url = document.location?.href ?? '';

  // Infuse the source URL into the JD text so the AI's Flash research
  // loop always has it even when the heuristic extraction missed the
  // bulk of the post. Without this failsafe, a mis-scraped JD (e.g.
  // Meta SPA that rendered a 1k-char slice out of a 4k-char post) left
  // the AI with no way to recover -- the URL was only in a sibling
  // metadata field the LLM never saw. Pinning it at the top of the
  // text lets the LLM re-fetch / re-research if needed.
  const withSourceUrl = (text: string): string => {
    if (!url) return text;
    // Avoid double-prefixing if the text already starts with a URL line.
    if (text.startsWith('Source URL:') || text.startsWith(`${url}`)) return text;
    return `Source URL: ${url}\n\n${text}`;
  };

  if (agent === 'job-hunter') {
    const objs = findJsonLdObjects(document);
    const jd = extractJobPosting(objs);
    if (jd) {
      const result: GenericScanJdResult = {
        kind: 'job-description',
        text: withSourceUrl(jd.description),
        method: 'jsonld',
        ...(jd.title ? { jobTitle: jd.title } : {}),
        ...(jd.company ? { company: jd.company } : {}),
        url,
      };
      return { ok: true, result };
    }
    if (hasJobPostingMarkers(document)) {
      const text = textViaReadability(document);
      if (text.length >= 300) {
        const hints = extractJobHints(document, objs);
        const result: GenericScanJdResult = {
          kind: 'job-description',
          text: withSourceUrl(text),
          method: 'readability',
          ...(hints.jobTitle ? { jobTitle: hints.jobTitle } : {}),
          ...(hints.company ? { company: hints.company } : {}),
          url,
        };
        return { ok: true, result };
      }
    }
    return { ok: false, reason: 'no-match' };
  }

  // b2b-sales
  const { signals, companyName } = detectCompanySignals(document);
  if (signals.length === 0) {
    return { ok: false, reason: 'no-match' };
  }
  const result: GenericScanCompanyResult = {
    kind: 'company-page',
    url,
    signals,
    ...(companyName ? { companyName } : {}),
  };
  return { ok: true, result };
}

export interface GenericIntentDeps {
  readonly logger: Logger;
  readonly scripting: {
    executeScript: (args: {
      target: { tabId: number };
      func: (agent: GenericScanAgent) => GenericScanResult;
      args: readonly [GenericScanAgent];
    }) => Promise<ReadonlyArray<{ result?: unknown }>>;
  };
}

export function createGenericIntentHandler(
  deps: GenericIntentDeps,
): (msg: { readonly data: unknown }) => Promise<GenericIntentDetectResponse> {
  return async function GENERIC_INTENT_DETECT(msg) {
    const parsed = GenericIntentDetectRequestSchema.safeParse(msg.data);
    if (!parsed.success) {
      return { ok: false, reason: 'invalid-payload' };
    }
    const { tabId, agent } = parsed.data;
    let results: ReadonlyArray<{ result?: unknown }>;
    try {
      results = await deps.scripting.executeScript({
        target: { tabId },
        func: scanForGenericIntent,
        args: [agent],
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      deps.logger.warn('GENERIC_INTENT_DETECT: executeScript failed', { error: message, tabId });
      if (/cannot access/i.test(message) || /permission/i.test(message)) {
        return { ok: false, reason: 'permission-denied' };
      }
      if (/no tab with id/i.test(message)) {
        return { ok: false, reason: 'no-tab' };
      }
      return { ok: false, reason: 'script-inject-failed' };
    }
    const first = results?.[0];
    if (!first || typeof first.result !== 'object' || first.result === null) {
      return { ok: false, reason: 'no-match' };
    }
    const validated = GenericIntentDetectResponseSchema.safeParse(first.result);
    if (!validated.success) {
      return { ok: false, reason: 'no-match' };
    }
    return validated.data;
  };
}
