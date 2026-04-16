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
    const article = doc.querySelector('article');
    const main = doc.querySelector('main');
    const candidate = article ?? main ?? doc.body;
    if (!candidate) return '';
    return (candidate.textContent ?? '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, MAX_TEXT);
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
