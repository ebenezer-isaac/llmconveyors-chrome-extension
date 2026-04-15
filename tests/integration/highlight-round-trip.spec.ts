// SPDX-License-Identifier: MIT
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import type { Mock } from 'vitest';
import {
  createFakeChrome,
  seedStorage,
} from './_lib/fake-chrome';
import { createMockBackend, type MockBackend } from './_lib/mock-backend';
import { createApplyHandler } from '@/src/content/highlight/apply-handler';
import type { ApplyHandlerDeps } from '@/src/content/highlight/apply-handler';
import { createClearHandler } from '@/src/content/highlight/clear-handler';
import {
  __resetHighlightStateForTest,
  setHighlightState,
} from '@/src/content/highlight/state';
import { __resetJdCacheForTest } from '@/src/content/highlight/jd-cache';
import type { Logger } from '@/src/background/log';
import type { PageIntent } from 'ats-autofill-engine';
import type { KeywordsExtractResponse } from '@/src/background/messaging/protocol-types';

const BACKEND_URL = 'https://api.llmconveyors.local';
const REGISTER_HANDLERS_MODULE =
  '../../src/background/messaging/register-handlers';

interface RegisterHandlersModule {
  readonly registerHandlers: (customDeps?: unknown) => unknown;
  readonly __resetRegistration: () => void;
}

async function freshRegister(): Promise<void> {
  const mod = (await import(REGISTER_HANDLERS_MODULE)) as RegisterHandlersModule;
  mod.__resetRegistration();
  mod.registerHandlers({
    endpoints: {
      authExchange: `${BACKEND_URL}/api/v1/auth/extension-token-exchange`,
      authSignOut: `${BACKEND_URL}/api/v1/auth/sign-out`,
      extractSkills: `${BACKEND_URL}/api/v1/ats/extract-skills`,
      settingsProfile: `${BACKEND_URL}/api/v1/settings/profile`,
      generationStart: `${BACKEND_URL}/api/v1/agents/generate`,
      generationCancel: `${BACKEND_URL}/api/v1/agents/cancel`,
    },
  });
}

function fakeLogger(): Logger {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

function makeDoc(html: string): Document {
  const doc = document.implementation.createHTMLDocument('t');
  doc.body.innerHTML = html;
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

describe('HIGHLIGHT round-trip', () => {
  let fake: ReturnType<typeof createFakeChrome>;
  let backend: MockBackend;

  beforeEach(async () => {
    __resetHighlightStateForTest();
    __resetJdCacheForTest();
    fake = createFakeChrome();
    backend = createMockBackend();
    backend.mount(BACKEND_URL);
    await seedStorage('llmc.session.v1', {
      accessToken: 'at_test_001',
      refreshToken: 'rt_test_001',
      expiresAt: Date.now() + 60 * 60 * 1000,
      userId: 'user_test_001',
    });
    await freshRegister();
  });

  afterEach(() => {
    backend.unmount();
  });

  it('HIGHLIGHT_APPLY round-trip -> fetches backend, runs engine, returns ok envelope', async () => {
    backend.route('POST', '/api/v1/ats/extract-skills', {
      status: 200,
      body: {
        success: true,
        data: {
          keywords: [
            {
              term: 'TypeScript',
              category: 'tool',
              score: 1,
              occurrences: 1,
              canonicalForm: 'typescript',
            },
          ],
          tookMs: 5,
        },
      },
    });

    const cleanupFn: Mock<() => void> = vi.fn();
    const applyHighlights: Mock<
      (root: Element, kw: readonly string[]) => () => void
    > = vi.fn(
      (() => cleanupFn) as unknown as (
        root: Element,
        kw: readonly string[],
      ) => () => void,
    );
    const removeAllHighlights: Mock<(root: Element) => void> = vi.fn();
    const extractJobDescription: Mock<
      (
        d: Document,
      ) => Promise<{ text: string; method: 'jsonld' } | null>
    > = vi.fn(async () => ({
      text: 'Great role with TypeScript',
      method: 'jsonld',
    })) as unknown as Mock<
      (
        d: Document,
      ) => Promise<{ text: string; method: 'jsonld' } | null>
    >;
    const detectPageIntent: Mock<(l: Location, d: Document) => PageIntent> =
      vi.fn(() => ({
        kind: 'greenhouse',
        pageKind: 'job-posting',
        url: 'https://boards.greenhouse.io/a/1',
      })) as unknown as Mock<(l: Location, d: Document) => PageIntent>;

    const deps: ApplyHandlerDeps = {
      logger: fakeLogger(),
      document: makeDoc('<mark data-ats-autofill="true">TypeScript</mark>'),
      location: makeLocation('https://boards.greenhouse.io/a/1'),
      now: () => 1_000,
      applyHighlights:
        applyHighlights as unknown as ApplyHandlerDeps['applyHighlights'],
      removeAllHighlights:
        removeAllHighlights as unknown as ApplyHandlerDeps['removeAllHighlights'],
      extractJobDescription:
        extractJobDescription as unknown as ApplyHandlerDeps['extractJobDescription'],
      detectPageIntent:
        detectPageIntent as unknown as ApplyHandlerDeps['detectPageIntent'],
      sendKeywordsExtract: async (args) => {
        const response = (await fake.runtime.sendMessage({
          key: 'KEYWORDS_EXTRACT',
          data: { text: args.text, url: args.url, topK: args.topK },
        })) as KeywordsExtractResponse;
        return response;
      },
    };

    const handler = createApplyHandler(deps);
    const res = await handler();
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.keywordCount).toBe(1);
    }
    expect(applyHighlights).toHaveBeenCalledTimes(1);
  });

  it('HIGHLIGHT_APPLY round-trip -> returns signed-out when no session present', async () => {
    await fake.storage.local.remove('llmc.session.v1');
    const applyHighlights: Mock<
      (root: Element, kw: readonly string[]) => () => void
    > = vi.fn();
    const removeAllHighlights: Mock<(root: Element) => void> = vi.fn();
    const extractJobDescription: Mock<
      (
        d: Document,
      ) => Promise<{ text: string; method: 'jsonld' } | null>
    > = vi.fn(async () => ({
      text: 'Great role',
      method: 'jsonld',
    })) as unknown as Mock<
      (
        d: Document,
      ) => Promise<{ text: string; method: 'jsonld' } | null>
    >;
    const detectPageIntent: Mock<(l: Location, d: Document) => PageIntent> =
      vi.fn(() => ({
        kind: 'greenhouse',
        pageKind: 'job-posting',
        url: 'https://boards.greenhouse.io/a/1',
      })) as unknown as Mock<(l: Location, d: Document) => PageIntent>;

    const deps: ApplyHandlerDeps = {
      logger: fakeLogger(),
      document: makeDoc(''),
      location: makeLocation('https://boards.greenhouse.io/a/1'),
      now: () => 1_000,
      applyHighlights:
        applyHighlights as unknown as ApplyHandlerDeps['applyHighlights'],
      removeAllHighlights:
        removeAllHighlights as unknown as ApplyHandlerDeps['removeAllHighlights'],
      extractJobDescription:
        extractJobDescription as unknown as ApplyHandlerDeps['extractJobDescription'],
      detectPageIntent:
        detectPageIntent as unknown as ApplyHandlerDeps['detectPageIntent'],
      sendKeywordsExtract: async (args) => {
        return (await fake.runtime.sendMessage({
          key: 'KEYWORDS_EXTRACT',
          data: { text: args.text, url: args.url, topK: args.topK },
        })) as KeywordsExtractResponse;
      },
    };

    const handler = createApplyHandler(deps);
    const res = await handler();
    expect(res).toEqual({ ok: false, reason: 'signed-out' });
    expect(applyHighlights).not.toHaveBeenCalled();
  });

  it('HIGHLIGHT_CLEAR round-trip -> invokes stored cleanup and returns ok envelope', async () => {
    const cleanup: Mock<() => void> = vi.fn();
    setHighlightState({
      cleanup: cleanup as unknown as () => void,
      keywordCount: 2,
      rangeCount: 2,
      appliedAt: 1,
      url: 'https://x.test/',
    });
    const removeAllHighlights: Mock<(root: Element) => void> = vi.fn();
    const handler = createClearHandler({
      logger: fakeLogger(),
      document: makeDoc('<mark>x</mark>'),
      removeAllHighlights:
        removeAllHighlights as unknown as (root: Element) => void,
    });
    const res = await handler();
    expect(res).toEqual({ ok: true, cleared: true });
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(removeAllHighlights).toHaveBeenCalledTimes(1);
  });

  it('INTENT_DETECTED round-trip -> bg handler stores intent in per-tab state', async () => {
    const payload = {
      tabId: -1,
      url: 'https://boards.greenhouse.io/a/1',
      kind: 'greenhouse' as const,
      pageKind: 'job-posting' as const,
      jobTitle: 'SWE',
      company: 'Acme',
      detectedAt: 1_000,
    };
    const sendResult = await fake.runtime.sendMessage({
      key: 'INTENT_DETECTED',
      data: payload,
    });
    expect(sendResult).toBeUndefined();
    // Since the fake runtime has no real sender.tab.id, a -1 sentinel is
    // dropped by the handler. Send again with an explicit tabId so the
    // bg stores it and INTENT_GET can observe it.
    await fake.runtime.sendMessage({
      key: 'INTENT_DETECTED',
      data: { ...payload, tabId: 7 },
    });
    const got = await fake.runtime.sendMessage({
      key: 'INTENT_GET',
      data: { tabId: 7 },
    });
    expect(got).toMatchObject({
      kind: 'greenhouse',
      pageKind: 'job-posting',
      jobTitle: 'SWE',
      company: 'Acme',
    });
  });
});
