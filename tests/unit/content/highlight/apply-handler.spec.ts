// SPDX-License-Identifier: MIT
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { createApplyHandler } from '@/src/content/highlight/apply-handler';
import type { ApplyHandlerDeps } from '@/src/content/highlight/apply-handler';
import {
  __resetHighlightStateForTest,
  getHighlightState,
} from '@/src/content/highlight/state';
import { __resetJdCacheForTest } from '@/src/content/highlight/jd-cache';
import type { Logger } from '@/src/background/log';
import type {
  KeywordsExtractResponse,
} from '@/src/background/messaging/protocol-types';
import type { PageIntent } from 'ats-autofill-engine';

function fakeLogger(): Logger {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

function makeDoc(bodyHtml: string): Document {
  const doc = document.implementation.createHTMLDocument('t');
  doc.body.innerHTML = bodyHtml;
  return doc;
}

function makeLocation(href: string): Location {
  const u = new URL(href);
  return {
    href: u.href,
    host: u.host,
    hostname: u.hostname,
    pathname: u.pathname,
    origin: u.origin,
    protocol: u.protocol,
    search: u.search,
    hash: u.hash,
    port: u.port,
  } as unknown as Location;
}

function okKeywordsResponse(): KeywordsExtractResponse {
  return {
    ok: true,
    keywords: [
      {
        term: 'TypeScript',
        category: 'tool',
        score: 1,
        occurrences: 1,
        canonicalForm: 'typescript',
      },
      {
        term: 'React',
        category: 'tool',
        score: 0.9,
        occurrences: 1,
        canonicalForm: 'react',
      },
    ],
    tookMs: 10,
  };
}

interface BuildOptions {
  readonly intent?: PageIntent;
  readonly jdResult?:
    | { text: string; method: 'jsonld' | 'readability' }
    | null;
  readonly extractThrows?: boolean;
  readonly keywordsResponse?: KeywordsExtractResponse | Promise<never>;
  readonly keywordsThrows?: unknown;
  readonly applyThrows?: unknown;
  readonly bodyHtml?: string;
}

function buildDeps(opts: BuildOptions = {}): {
  readonly deps: ApplyHandlerDeps;
  readonly sendKeywordsExtract: Mock<
    (args: {
      readonly text: string;
      readonly url: string;
      readonly topK: number;
    }) => Promise<KeywordsExtractResponse>
  >;
  readonly applyHighlights: Mock<
    (root: Element, keywords: readonly string[]) => () => void
  >;
  readonly removeAllHighlights: Mock<(root: Element) => void>;
  readonly cleanupFn: Mock<() => void>;
} {
  const bodyHtml =
    opts.bodyHtml ??
    '<mark data-ats-autofill="true">TypeScript</mark><mark data-ats-autofill="true">React</mark>';
  const doc = makeDoc(bodyHtml);
  // Sanity: tests may expect applied marks; when applyHighlights is called
  // we simulate that by leaving the marks already in the body html.
  const cleanupFn: Mock<() => void> = vi.fn(() => undefined);
  const applyHighlights: Mock<
    (root: Element, keywords: readonly string[]) => () => void
  > = vi.fn((_root: Element, _kw: readonly string[]) => {
    if (opts.applyThrows) {
      throw opts.applyThrows;
    }
    return cleanupFn as unknown as () => void;
  }) as unknown as Mock<
    (root: Element, keywords: readonly string[]) => () => void
  >;
  const removeAllHighlights: Mock<(root: Element) => void> = vi.fn(
    () => undefined,
  );
  const intent: PageIntent =
    opts.intent ??
    ({
      kind: 'greenhouse',
      pageKind: 'job-posting',
      url: 'https://boards.greenhouse.io/a/1',
    } as const);
  const detectPageIntent: Mock<(l: Location, d: Document) => PageIntent> = vi.fn(
    () => intent,
  );

  const jdResult =
    'jdResult' in opts
      ? opts.jdResult
      : { text: 'body text', method: 'jsonld' as const };
  const extractJobDescription: Mock<
    (
      d: Document,
    ) => Promise<{ text: string; method: 'jsonld' | 'readability' } | null>
  > = vi.fn(async () => {
    if (opts.extractThrows) {
      throw new Error('extract failed');
    }
    return jdResult ?? null;
  }) as unknown as Mock<
    (
      d: Document,
    ) => Promise<{ text: string; method: 'jsonld' | 'readability' } | null>
  >;

  const sendKeywordsExtract: Mock<
    (args: {
      readonly text: string;
      readonly url: string;
      readonly topK: number;
    }) => Promise<KeywordsExtractResponse>
  > = vi.fn(async () => {
    if (opts.keywordsThrows) {
      throw opts.keywordsThrows;
    }
    return (
      (opts.keywordsResponse as KeywordsExtractResponse) ?? okKeywordsResponse()
    );
  }) as unknown as Mock<
    (args: {
      readonly text: string;
      readonly url: string;
      readonly topK: number;
    }) => Promise<KeywordsExtractResponse>
  >;

  const deps: ApplyHandlerDeps = {
    logger: fakeLogger(),
    document: doc,
    location: makeLocation('https://boards.greenhouse.io/a/1'),
    now: () => 1_000,
    applyHighlights: applyHighlights as unknown as ApplyHandlerDeps['applyHighlights'],
    removeAllHighlights:
      removeAllHighlights as unknown as ApplyHandlerDeps['removeAllHighlights'],
    extractJobDescription:
      extractJobDescription as unknown as ApplyHandlerDeps['extractJobDescription'],
    detectPageIntent:
      detectPageIntent as unknown as ApplyHandlerDeps['detectPageIntent'],
    sendKeywordsExtract,
  };
  return {
    deps,
    sendKeywordsExtract,
    applyHighlights,
    removeAllHighlights,
    cleanupFn,
  };
}

describe('createApplyHandler', () => {
  beforeEach(() => {
    __resetHighlightStateForTest();
    __resetJdCacheForTest();
  });

  it('returns ok=true with keyword + range counts on happy path', async () => {
    const { deps, applyHighlights, sendKeywordsExtract } = buildDeps();
    const handler = createApplyHandler(deps);
    const res = await handler();
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.keywordCount).toBe(2);
      expect(res.rangeCount).toBe(2);
    }
    expect(applyHighlights).toHaveBeenCalledTimes(1);
    expect(sendKeywordsExtract).toHaveBeenCalledTimes(1);
    const state = getHighlightState();
    expect(state.cleanup).not.toBeNull();
    expect(state.keywordCount).toBe(2);
  });

  it('short-circuits to no-jd-on-page for unknown intent', async () => {
    const { deps, applyHighlights } = buildDeps({
      intent: { kind: 'unknown', url: 'https://x.test/' } as PageIntent,
    });
    const handler = createApplyHandler(deps);
    const res = await handler();
    expect(res).toEqual({ ok: false, reason: 'no-jd-on-page' });
    expect(applyHighlights).not.toHaveBeenCalled();
  });

  it('short-circuits to not-a-job-posting on application-form', async () => {
    const { deps } = buildDeps({
      intent: {
        kind: 'greenhouse',
        pageKind: 'application-form',
        url: 'https://boards.greenhouse.io/a/1/apply',
      } as PageIntent,
    });
    const handler = createApplyHandler(deps);
    const res = await handler();
    expect(res).toEqual({ ok: false, reason: 'not-a-job-posting' });
  });

  it('returns no-jd-on-page when extractJobDescription returns null', async () => {
    const { deps } = buildDeps({ jdResult: null });
    const handler = createApplyHandler(deps);
    const res = await handler();
    expect(res).toEqual({ ok: false, reason: 'no-jd-on-page' });
  });

  it('returns no-jd-on-page when extractJobDescription throws', async () => {
    const { deps } = buildDeps({ extractThrows: true });
    const handler = createApplyHandler(deps);
    const res = await handler();
    expect(res).toEqual({ ok: false, reason: 'no-jd-on-page' });
  });

  it('returns no-jd-on-page when extracted text is empty', async () => {
    const { deps } = buildDeps({
      jdResult: { text: '', method: 'jsonld' },
    });
    const handler = createApplyHandler(deps);
    const res = await handler();
    expect(res).toEqual({ ok: false, reason: 'no-jd-on-page' });
  });

  it('returns network-error when sendKeywordsExtract throws', async () => {
    const { deps } = buildDeps({ keywordsThrows: new Error('disconnected') });
    const handler = createApplyHandler(deps);
    const res = await handler();
    expect(res).toEqual({ ok: false, reason: 'network-error' });
  });

  it('passes through signed-out reason from bg', async () => {
    const { deps } = buildDeps({
      keywordsResponse: { ok: false, reason: 'signed-out' },
    });
    const handler = createApplyHandler(deps);
    const res = await handler();
    expect(res).toEqual({ ok: false, reason: 'signed-out' });
  });

  it('passes through rate-limited reason from bg', async () => {
    const { deps } = buildDeps({
      keywordsResponse: { ok: false, reason: 'rate-limited' },
    });
    const handler = createApplyHandler(deps);
    const res = await handler();
    expect(res).toEqual({ ok: false, reason: 'rate-limited' });
  });

  it('remaps empty-text bg reason to no-jd-on-page', async () => {
    const { deps } = buildDeps({
      keywordsResponse: { ok: false, reason: 'empty-text' },
    });
    const handler = createApplyHandler(deps);
    const res = await handler();
    expect(res).toEqual({ ok: false, reason: 'no-jd-on-page' });
  });

  it('returns api-error when bg response fails Zod guard', async () => {
    // Cast through unknown to simulate a malformed response slipping past TS.
    const { deps } = buildDeps({
      keywordsResponse: {
        ok: true,
        keywords: [{ term: '', category: 'xxx' }],
      } as unknown as KeywordsExtractResponse,
    });
    const handler = createApplyHandler(deps);
    const res = await handler();
    expect(res).toEqual({ ok: false, reason: 'api-error' });
  });

  it('returns render-error when applyHighlights throws', async () => {
    const { deps } = buildDeps({ applyThrows: new Error('dom went boom') });
    const handler = createApplyHandler(deps);
    const res = await handler();
    expect(res).toEqual({ ok: false, reason: 'render-error' });
  });

  it('returns ok=true with zero counts when backend returns empty keyword list', async () => {
    const { deps, applyHighlights } = buildDeps({
      bodyHtml: '<p>no marks</p>',
      keywordsResponse: { ok: true, keywords: [], tookMs: 5 },
    });
    const handler = createApplyHandler(deps);
    const res = await handler();
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.keywordCount).toBe(0);
      expect(res.rangeCount).toBe(0);
    }
    expect(applyHighlights).not.toHaveBeenCalled();
  });

  it('runs removeAllHighlights before a new apply (belt-and-braces)', async () => {
    const { deps, removeAllHighlights } = buildDeps();
    const handler = createApplyHandler(deps);
    await handler();
    expect(removeAllHighlights).toHaveBeenCalledTimes(1);
  });

  it('rejects concurrent applies via the single-flight mutex', async () => {
    let release: (v: KeywordsExtractResponse) => void = () => undefined;
    const slow = new Promise<KeywordsExtractResponse>((res) => {
      release = res;
    });
    const { deps } = buildDeps();
    // Replace sendKeywordsExtract with one that returns the slow promise.
    (deps as { sendKeywordsExtract: ApplyHandlerDeps['sendKeywordsExtract'] }).sendKeywordsExtract =
      vi.fn(
        async () => slow,
      ) as unknown as ApplyHandlerDeps['sendKeywordsExtract'];
    const handler = createApplyHandler(deps);

    const first = handler();
    const second = handler();
    // Second rejects immediately through the mutex; we mapped to api-error.
    const secondRes = await second;
    expect(secondRes).toEqual({ ok: false, reason: 'api-error' });

    release(okKeywordsResponse());
    const firstRes = await first;
    expect(firstRes.ok).toBe(true);
  });

  it('caches extracted JD per-URL across subsequent applies', async () => {
    const { deps } = buildDeps();
    const handler = createApplyHandler(deps);
    await handler();
    await handler();
    expect(deps.extractJobDescription).toHaveBeenCalledTimes(1);
  });
});
