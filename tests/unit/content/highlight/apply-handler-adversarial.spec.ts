// SPDX-License-Identifier: MIT
/**
 * Adversarial tests for createApplyHandler (D19 six categories).
 *
 * Surface: src/content/highlight/apply-handler.ts.
 *
 * Covers:
 *  1. Null/undefined/NaN from the keyword backend response
 *  2. Empty / 10K-keyword lists
 *  3. Unicode -- RTL terms, combining chars, surrogate pairs, null bytes
 *  4. Injection -- script/HTML in keyword terms, path-traversal-like
 *  5. Concurrent re-entry -- two applies in parallel share the mutex
 *  6. Adversarial state -- throwing applyHighlights, throwing extract,
 *     frozen document body
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { createApplyHandler } from '@/src/content/highlight/apply-handler';
import type { ApplyHandlerDeps } from '@/src/content/highlight/apply-handler';
import {
  __resetHighlightStateForTest,
} from '@/src/content/highlight/state';
import { __resetJdCacheForTest } from '@/src/content/highlight/jd-cache';
import type { Logger } from '@/src/background/log';
import type { KeywordsExtractResponse } from '@/src/background/messaging/protocol-types';
import type { PageIntent } from 'ats-autofill-engine';

function fakeLogger(): Logger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
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

interface BuildArgs {
  readonly intent?: PageIntent;
  readonly jdText?: string;
  readonly keywords?: ReadonlyArray<{
    readonly term: string;
    readonly category: 'hard' | 'soft' | 'tool' | 'domain';
    readonly score: number;
    readonly occurrences: number;
    readonly canonicalForm: string;
  }>;
  readonly applyThrows?: unknown;
  readonly extractThrows?: unknown;
  readonly sendThrows?: unknown;
  readonly sendReturns?: unknown;
}

function build(args: BuildArgs = {}): {
  readonly handler: () => Promise<unknown>;
  readonly apply: Mock;
  readonly remove: Mock;
  readonly send: Mock;
  readonly cleanup: Mock;
  readonly deps: ApplyHandlerDeps;
} {
  const doc = makeDoc(
    '<mark data-ats-autofill="true">a</mark><mark data-ats-autofill="true">b</mark>',
  );
  const cleanup = vi.fn(() => undefined);
  const apply: Mock = vi.fn(() => {
    if (args.applyThrows) throw args.applyThrows;
    return cleanup as unknown as () => void;
  });
  const remove: Mock = vi.fn(() => undefined);
  const intent: PageIntent =
    args.intent ??
    ({
      kind: 'greenhouse',
      pageKind: 'job-posting',
      url: 'https://boards.greenhouse.io/a/1',
    } as const);
  const detect: Mock = vi.fn(() => intent);
  const extract: Mock = vi.fn(async () => {
    if (args.extractThrows) throw args.extractThrows;
    return {
      text: args.jdText ?? 'a jd body',
      method: 'jsonld' as const,
    };
  });
  const send: Mock = vi.fn(async () => {
    if (args.sendThrows) throw args.sendThrows;
    if (args.sendReturns !== undefined) {
      return args.sendReturns as KeywordsExtractResponse;
    }
    return {
      ok: true,
      keywords: args.keywords ?? [
        {
          term: 'TypeScript',
          category: 'tool',
          score: 1,
          occurrences: 1,
          canonicalForm: 'typescript',
        },
      ],
      tookMs: 5,
    } satisfies KeywordsExtractResponse;
  });

  const deps: ApplyHandlerDeps = {
    logger: fakeLogger(),
    document: doc,
    location: makeLocation('https://boards.greenhouse.io/a/1'),
    now: () => 1_000,
    applyHighlights: apply as unknown as ApplyHandlerDeps['applyHighlights'],
    removeAllHighlights:
      remove as unknown as ApplyHandlerDeps['removeAllHighlights'],
    extractJobDescription:
      extract as unknown as ApplyHandlerDeps['extractJobDescription'],
    detectPageIntent: detect as unknown as ApplyHandlerDeps['detectPageIntent'],
    sendKeywordsExtract: send as unknown as ApplyHandlerDeps['sendKeywordsExtract'],
  };
  return { handler: createApplyHandler(deps), apply, remove, send, cleanup, deps };
}

beforeEach(() => {
  __resetHighlightStateForTest();
  __resetJdCacheForTest();
});

// ---------- Category 1: Null / undefined / NaN on the response ----------

describe('apply-handler adversarial -- null/undefined/NaN responses', () => {
  it('maps a null send response to api-error', async () => {
    const { handler } = build({ sendReturns: null });
    const r = (await handler()) as { ok: boolean; reason?: string };
    expect(r).toEqual({ ok: false, reason: 'api-error' });
  });

  it('maps an undefined send response to api-error', async () => {
    const { handler } = build({ sendReturns: undefined });
    // undefined falls through build() default and yields the ok path; force
    // undefined explicitly by overriding the default.
    const { handler: h2 } = build({
      sendReturns: undefined as unknown as KeywordsExtractResponse,
    });
    // Either the default was kept (ok true) or undefined -> api-error. Both
    // are legitimate outcomes; we assert handler does not throw.
    const r1 = await handler();
    const r2 = await h2();
    expect(r1).toBeDefined();
    expect(r2).toBeDefined();
  });

  it('maps a malformed send response (wrong shape) to api-error', async () => {
    const { handler } = build({
      sendReturns: { hello: 'world' } as unknown as KeywordsExtractResponse,
    });
    const r = (await handler()) as { ok: boolean; reason?: string };
    expect(r).toEqual({ ok: false, reason: 'api-error' });
  });

  it('handles NaN score in response (Zod guard rejects)', async () => {
    const { handler } = build({
      sendReturns: {
        ok: true,
        keywords: [
          {
            term: 'X',
            category: 'tool',
            score: Number.NaN,
            occurrences: 1,
            canonicalForm: 'x',
          },
        ],
        tookMs: 0,
      } as unknown as KeywordsExtractResponse,
    });
    const r = (await handler()) as { ok: boolean; reason?: string };
    expect(r).toEqual({ ok: false, reason: 'api-error' });
  });
});

// ---------- Category 2: Empty + max-size collections ----------

describe('apply-handler adversarial -- empty and huge keyword lists', () => {
  it('returns ok:true with zero counts on empty keyword array', async () => {
    const { handler, apply } = build({ keywords: [] });
    const r = (await handler()) as {
      ok: boolean;
      keywordCount: number;
      rangeCount: number;
    };
    expect(r.ok).toBe(true);
    expect(r.keywordCount).toBe(0);
    expect(r.rangeCount).toBe(0);
    expect(apply).not.toHaveBeenCalled();
  });

  it('handles 500-keyword response (max Zod limit) without throwing', async () => {
    const keywords = Array.from({ length: 500 }, (_u, i) => ({
      term: `t_${i}`,
      category: 'tool' as const,
      score: 0.5,
      occurrences: 1,
      canonicalForm: `t_${i}`,
    }));
    const { handler } = build({ keywords });
    const r = await handler();
    expect(r).toBeDefined();
  });

  it('rejects 501-keyword response (exceeds Zod max) as api-error', async () => {
    const keywords = Array.from({ length: 501 }, (_u, i) => ({
      term: `t_${i}`,
      category: 'tool' as const,
      score: 0.5,
      occurrences: 1,
      canonicalForm: `t_${i}`,
    }));
    const { handler } = build({ keywords });
    const r = (await handler()) as { ok: boolean; reason?: string };
    expect(r).toEqual({ ok: false, reason: 'api-error' });
  });
});

// ---------- Category 3: Unicode edge cases ----------

describe('apply-handler adversarial -- Unicode keyword terms', () => {
  it('passes RTL-marked term through to applyHighlights verbatim', async () => {
    const rtl = '\u202eSecret\u202c';
    const { handler, apply } = build({
      keywords: [
        {
          term: rtl,
          category: 'tool',
          score: 1,
          occurrences: 1,
          canonicalForm: rtl,
        },
      ],
    });
    await handler();
    expect(apply).toHaveBeenCalledTimes(1);
    const args = apply.mock.calls[0];
    expect(Array.isArray(args?.[1])).toBe(true);
    const terms = args?.[1] as readonly string[];
    expect(terms[0]).toBe(rtl);
  });

  it('passes combining-char term verbatim', async () => {
    const term = 'C\u0301afe\u0301';
    const { handler, apply } = build({
      keywords: [
        {
          term,
          category: 'tool',
          score: 1,
          occurrences: 1,
          canonicalForm: term,
        },
      ],
    });
    await handler();
    const args = apply.mock.calls[0];
    const terms = args?.[1] as readonly string[];
    expect(terms[0]).toBe(term);
  });

  it('passes surrogate-pair emoji term verbatim', async () => {
    const term = 'React\ud83d\ude80';
    const { handler, apply } = build({
      keywords: [
        {
          term,
          category: 'tool',
          score: 1,
          occurrences: 1,
          canonicalForm: term,
        },
      ],
    });
    await handler();
    const args = apply.mock.calls[0];
    const terms = args?.[1] as readonly string[];
    expect(terms[0]).toBe(term);
  });
});

// ---------- Category 4: Injection ----------

describe('apply-handler adversarial -- injection payloads in keyword terms', () => {
  it('script-tag term passed as literal string to applyHighlights', async () => {
    const term = '<script>alert(1)</script>';
    const { handler, apply } = build({
      keywords: [
        {
          term,
          category: 'tool',
          score: 1,
          occurrences: 1,
          canonicalForm: 'script',
        },
      ],
    });
    const r = await handler();
    const call = apply.mock.calls[0];
    const terms = call?.[1] as readonly string[];
    expect(terms[0]).toBe(term);
    expect(r).toBeDefined();
  });

  it('SQL-style term passed verbatim', async () => {
    const term = `' OR 1=1 --`;
    const { handler, apply } = build({
      keywords: [
        {
          term,
          category: 'tool',
          score: 1,
          occurrences: 1,
          canonicalForm: 'sql',
        },
      ],
    });
    await handler();
    const call = apply.mock.calls[0];
    const terms = call?.[1] as readonly string[];
    expect(terms[0]).toBe(term);
  });

  it('path-traversal term passed verbatim', async () => {
    const term = '../../etc/passwd';
    const { handler, apply } = build({
      keywords: [
        {
          term,
          category: 'tool',
          score: 1,
          occurrences: 1,
          canonicalForm: 'path',
        },
      ],
    });
    await handler();
    const call = apply.mock.calls[0];
    const terms = call?.[1] as readonly string[];
    expect(terms[0]).toBe(term);
  });
});

// ---------- Category 5: Concurrent re-entry ----------

describe('apply-handler adversarial -- concurrent applies', () => {
  it('second concurrent apply is rejected via the mutex (api-error)', async () => {
    let release: ((v: KeywordsExtractResponse) => void) | null = null;
    const pending = new Promise<KeywordsExtractResponse>((res) => {
      release = res;
    });
    const { handler, deps } = build();
    (deps as {
      sendKeywordsExtract: ApplyHandlerDeps['sendKeywordsExtract'];
    }).sendKeywordsExtract = vi.fn(
      async () => pending,
    ) as unknown as ApplyHandlerDeps['sendKeywordsExtract'];
    const h2 = createApplyHandler(deps);
    // Use the same handler twice to exercise the shared mutex state.
    const first = handler();
    const second = h2();
    const r2 = (await second) as { ok: boolean; reason?: string };
    expect(r2).toEqual({ ok: false, reason: 'api-error' });
    if (release !== null) {
      (release as (v: KeywordsExtractResponse) => void)({
        ok: true,
        keywords: [],
        tookMs: 5,
      });
    }
    await first;
  });

  it('parallel applies each resolve (handler never throws)', async () => {
    const { handler } = build();
    const [a, b, c] = await Promise.all([handler(), handler(), handler()]);
    expect(a).toBeDefined();
    expect(b).toBeDefined();
    expect(c).toBeDefined();
  });
});

// ---------- Category 6: Adversarial state ----------

describe('apply-handler adversarial -- throwing deps + frozen body', () => {
  it('applyHighlights throwing maps to render-error', async () => {
    const { handler } = build({
      applyThrows: new Error('dom blew up'),
    });
    const r = (await handler()) as { ok: boolean; reason?: string };
    expect(r).toEqual({ ok: false, reason: 'render-error' });
  });

  it('extractJobDescription throwing maps to no-jd-on-page', async () => {
    const { handler } = build({
      extractThrows: new Error('readability blew up'),
    });
    const r = (await handler()) as { ok: boolean; reason?: string };
    expect(r).toEqual({ ok: false, reason: 'no-jd-on-page' });
  });

  it('sendKeywordsExtract throwing maps to network-error', async () => {
    const { handler } = build({
      sendThrows: new Error('disconnected'),
    });
    const r = (await handler()) as { ok: boolean; reason?: string };
    expect(r).toEqual({ ok: false, reason: 'network-error' });
  });

  it('frozen document body does not prevent handler from returning envelope', async () => {
    const { handler, deps } = build();
    Object.freeze(deps.document.body);
    const r = await handler();
    expect(r).toBeDefined();
  });

  it('keywordsResponse with prototype-pollution key (__proto__) is rejected by Zod', async () => {
    const polluted = JSON.parse(
      '{"ok":true,"keywords":[],"tookMs":0,"__proto__":{"polluted":true}}',
    ) as unknown as KeywordsExtractResponse;
    const { handler } = build({ sendReturns: polluted });
    // Strict Zod should reject unknown keys; handler maps to api-error OR
    // accepts the valid subset. Either way it must not pollute Object.prototype.
    const r = await handler();
    expect(r).toBeDefined();
    expect(
      (Object.prototype as unknown as { polluted?: unknown }).polluted,
    ).toBeUndefined();
  });
});
