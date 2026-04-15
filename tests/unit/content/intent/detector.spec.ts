// SPDX-License-Identifier: MIT
import { describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import {
  buildIntentPayload,
  detectIntentWithFallback,
  initIntentDetection,
} from '@/src/content/intent';
import type { PageIntent } from 'ats-autofill-engine';
import type { Logger } from '@/src/background/log';
import type { DetectedIntentPayload } from '@/src/background/messaging/protocol-types';

function fakeLogger(): Logger {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

function makeLocation(
  href: string,
): Location {
  const u = new URL(href);
  return {
    href: u.href,
    host: u.host,
    hostname: u.hostname,
    pathname: u.pathname,
    protocol: u.protocol,
    search: u.search,
    hash: u.hash,
    origin: u.origin,
    port: u.port,
  } as unknown as Location;
}

function makeDoc(html: string): Document {
  const doc = document.implementation.createHTMLDocument('t');
  doc.documentElement.innerHTML = html;
  return doc;
}

describe('detectIntentWithFallback', () => {
  it('returns engine intent verbatim when engine recognises the URL', () => {
    const engineIntent: PageIntent = {
      kind: 'greenhouse',
      pageKind: 'job-posting',
      url: 'https://boards.greenhouse.io/acme/jobs/1',
    };
    const detect: Mock = vi.fn(() => engineIntent);
    const intent = detectIntentWithFallback({
      detectPageIntent: detect as unknown as (
        l: Location,
        d: Document,
      ) => PageIntent,
      location: makeLocation('https://boards.greenhouse.io/acme/jobs/1'),
      document: makeDoc(''),
    });
    expect(intent).toBe(engineIntent);
  });

  it('falls back to job-posting on localhost fixture with JobPosting JSON-LD', () => {
    const detect: Mock = vi.fn(() => ({
      kind: 'unknown',
      url: 'http://localhost:5174/greenhouse-airbnb.html',
    }));
    const doc = makeDoc(
      '<head><script type="application/ld+json">{"@type":"JobPosting","title":"SWE"}</script></head><body></body>',
    );
    const intent = detectIntentWithFallback({
      detectPageIntent: detect as unknown as (
        l: Location,
        d: Document,
      ) => PageIntent,
      location: makeLocation(
        'http://localhost:5174/greenhouse-airbnb.html',
      ),
      document: doc,
    });
    expect(intent.kind).toBe('greenhouse');
    expect('pageKind' in intent && intent.pageKind).toBe('job-posting');
  });

  it('falls back to application-form on localhost fixture with fillable form', () => {
    const detect: Mock = vi.fn(() => ({
      kind: 'unknown',
      url: 'http://localhost:5174/lever-apply.html',
    }));
    const doc = makeDoc(
      '<body><form><input type="text"/><input type="email"/><textarea></textarea></form></body>',
    );
    const intent = detectIntentWithFallback({
      detectPageIntent: detect as unknown as (
        l: Location,
        d: Document,
      ) => PageIntent,
      location: makeLocation('http://localhost:5174/lever-apply.html'),
      document: doc,
    });
    expect(intent.kind).toBe('lever');
    expect('pageKind' in intent && intent.pageKind).toBe('application-form');
  });

  it('returns engine unknown when localhost path has no ATS prefix', () => {
    const engineIntent: PageIntent = {
      kind: 'unknown',
      url: 'http://localhost:5174/about.html',
    };
    const detect: Mock = vi.fn(() => engineIntent);
    const intent = detectIntentWithFallback({
      detectPageIntent: detect as unknown as (
        l: Location,
        d: Document,
      ) => PageIntent,
      location: makeLocation('http://localhost:5174/about.html'),
      document: makeDoc(''),
    });
    expect(intent.kind).toBe('unknown');
  });

  it('ignores localhost fallback when no job-posting signal present', () => {
    const engineIntent: PageIntent = {
      kind: 'unknown',
      url: 'http://localhost:5174/greenhouse-lost.html',
    };
    const detect: Mock = vi.fn(() => engineIntent);
    const doc = makeDoc('<body><p>not a job</p></body>');
    const intent = detectIntentWithFallback({
      detectPageIntent: detect as unknown as (
        l: Location,
        d: Document,
      ) => PageIntent,
      location: makeLocation(
        'http://localhost:5174/greenhouse-lost.html',
      ),
      document: doc,
    });
    expect(intent.kind).toBe('unknown');
  });
});

describe('buildIntentPayload', () => {
  it('returns null for unknown intents', () => {
    const out = buildIntentPayload({
      intent: { kind: 'unknown', url: 'http://x.test/' },
      url: 'http://x.test/',
      now: 1,
    });
    expect(out).toBeNull();
  });

  it('maps job-posting with jobData to payload with jobTitle + company', () => {
    const out = buildIntentPayload({
      intent: {
        kind: 'greenhouse',
        pageKind: 'job-posting',
        url: 'https://boards.greenhouse.io/a/1',
        jobData: {
          title: 'SWE',
          description: 'x',
          hiringOrganization: { name: 'Airbnb' },
          source: 'json-ld',
        },
      },
      url: 'https://boards.greenhouse.io/a/1',
      now: 42,
    });
    expect(out).toMatchObject({
      tabId: -1,
      kind: 'greenhouse',
      pageKind: 'job-posting',
      jobTitle: 'SWE',
      company: 'Airbnb',
      detectedAt: 42,
    });
  });

  it('maps application-form intent to payload without jobData fields', () => {
    const out = buildIntentPayload({
      intent: {
        kind: 'workday',
        pageKind: 'application-form',
        url: 'https://acme.myworkdayjobs.com/apply/1',
      },
      url: 'https://acme.myworkdayjobs.com/apply/1',
      now: 7,
    });
    expect(out).toEqual({
      tabId: -1,
      kind: 'workday',
      pageKind: 'application-form',
      url: 'https://acme.myworkdayjobs.com/apply/1',
      detectedAt: 7,
    });
  });
});

describe('initIntentDetection', () => {
  it('broadcasts a payload when intent is not unknown', async () => {
    const send: Mock<(p: DetectedIntentPayload) => Promise<void>> = vi.fn(
      async () => undefined,
    );
    const engineIntent: PageIntent = {
      kind: 'greenhouse',
      pageKind: 'job-posting',
      url: 'https://boards.greenhouse.io/a/1',
    };
    await initIntentDetection({
      logger: fakeLogger(),
      location: makeLocation('https://boards.greenhouse.io/a/1'),
      document: makeDoc(''),
      now: () => 100,
      detectPageIntent: vi.fn(() => engineIntent) as unknown as (
        l: Location,
        d: Document,
      ) => PageIntent,
      sendIntentDetected: send as unknown as (
        p: DetectedIntentPayload,
      ) => Promise<void>,
    });
    expect(send).toHaveBeenCalledTimes(1);
    const arg = send.mock.calls[0]![0];
    expect(arg).toMatchObject({
      kind: 'greenhouse',
      pageKind: 'job-posting',
      tabId: -1,
    });
  });

  it('does not broadcast for unknown intents', async () => {
    const send: Mock<(p: DetectedIntentPayload) => Promise<void>> = vi.fn(
      async () => undefined,
    );
    await initIntentDetection({
      logger: fakeLogger(),
      location: makeLocation('https://example.com/'),
      document: makeDoc(''),
      now: () => 100,
      detectPageIntent: vi.fn(() => ({
        kind: 'unknown',
        url: 'https://example.com/',
      })) as unknown as (l: Location, d: Document) => PageIntent,
      sendIntentDetected: send as unknown as (
        p: DetectedIntentPayload,
      ) => Promise<void>,
    });
    expect(send).not.toHaveBeenCalled();
  });

  it('swallows sendIntentDetected rejections', async () => {
    const send: Mock<(p: DetectedIntentPayload) => Promise<void>> = vi.fn(
      async () => {
        throw new Error('bg unavailable');
      },
    );
    const logger = fakeLogger();
    await expect(
      initIntentDetection({
        logger,
        location: makeLocation('https://boards.greenhouse.io/a/1'),
        document: makeDoc(''),
        now: () => 100,
        detectPageIntent: vi.fn(() => ({
          kind: 'greenhouse',
          pageKind: 'job-posting',
          url: 'https://boards.greenhouse.io/a/1',
        })) as unknown as (l: Location, d: Document) => PageIntent,
        sendIntentDetected: send as unknown as (
          p: DetectedIntentPayload,
        ) => Promise<void>,
      }),
    ).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalled();
  });
});
