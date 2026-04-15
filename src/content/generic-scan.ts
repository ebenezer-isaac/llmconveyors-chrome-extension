// SPDX-License-Identifier: MIT
/**
 * Generic scanner injected on-demand via chrome.scripting.executeScript.
 *
 * The function body runs in the page's world (MAIN world is NOT required; we
 * only read DOM). It attempts two strategies in order:
 *   1. Engine extractJobDescription(document) via JSON-LD or Readability.
 *   2. Company-page heuristics: JSON-LD `@type=Organization`, presence of
 *      about / contact links, and a corporate-looking hostname.
 *
 * Chrome scripting returns the function's resolved value as the
 * InjectionResult.  We keep the function self-contained (no external
 * imports) because chrome.scripting does not support module imports for
 * one-shot injection; the engine's extractJobDescription is imported by the
 * *caller* (background) and passed in via executeScript's `args` parameter
 * is not supported for function references, so we inline the minimal
 * required logic here.
 *
 * NOTE on logging: this module runs in a web page context and cannot use
 * the extension's createLogger. It returns all diagnostics via the result
 * object so the background can log them under its own scope.
 */

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
 * Inline implementation of the scan - passed to chrome.scripting.executeScript
 * as the `func` argument. MUST be self-contained (no closures over outer
 * variables except the explicit `args` list).
 */
export function scanForGenericIntent(agent: GenericScanAgent): GenericScanResult {
  const MAX_TEXT = 20_000;

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
        // ignore malformed JSON-LD blocks
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
    const article = doc.querySelector('article');
    const main = doc.querySelector('main');
    const candidate = article ?? main ?? doc.body;
    if (!candidate) return '';
    const text = (candidate.textContent ?? '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, MAX_TEXT);
    return text;
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

  if (agent === 'job-hunter') {
    const objs = findJsonLdObjects(document);
    const jd = extractJobPosting(objs);
    if (jd) {
      const result: GenericScanJdResult = {
        kind: 'job-description',
        text: jd.description,
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
        const result: GenericScanJdResult = {
          kind: 'job-description',
          text,
          method: 'readability',
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
