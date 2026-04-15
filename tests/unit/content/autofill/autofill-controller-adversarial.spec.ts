// SPDX-License-Identifier: MIT
/**
 * Adversarial tests for AutofillController (D19 six categories).
 *
 * Surface: autofill-controller.ts executeFill / bootstrap / teardown.
 *
 * Covers:
 *  1. Null/undefined/NaN adversarial profile + adapter inputs
 *  2. Empty and large (1000-field) FormModel handling
 *  3. Unicode -- RTL, combining chars, null bytes, surrogate pairs in profile
 *  4. Injection -- script tags and path-traversal-like values in profile
 *  5. Concurrent re-entry -- two executeFill() in parallel
 *  6. Adversarial state -- frozen profile, throwing-getter Proxy document,
 *     circular-structure profile (should not throw through the controller)
 *
 * Every test asserts a typed FillRequestResponse outcome; the controller
 * MUST NEVER throw to its caller.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  AutofillController,
  type AutofillControllerDeps,
} from '@/src/content/autofill/autofill-controller';
import type {
  AtsAdapter,
  AtsKind,
  FillInstruction,
  FillResult,
  FormModel,
} from 'ats-autofill-engine';
import type { Profile } from 'ats-autofill-engine/profile';
import type { Logger } from '@/src/background/log';

function fakeLogger(): Logger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

function baseProfile(overrides: Partial<Profile['basics']> = {}): Profile {
  return {
    profileVersion: '1.0',
    updatedAtMs: 1_713_000_000_000,
    basics: {
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'jane.doe@example.com',
      phone: '+1-415-555-0101',
      website: 'https://jane.example.com',
      linkedin: 'https://linkedin.com/in/jane',
      github: 'https://github.com/jane',
      ...overrides,
    },
    work: [],
    education: [],
    skills: [],
  } as Profile;
}

function docFor(host = 'boards.greenhouse.io'): Document {
  return {
    location: { href: `https://${host}/acme/jobs/1`, host },
  } as unknown as Document;
}

function makeAdapter(
  kind: AtsKind,
  over: Partial<AtsAdapter> = {},
): AtsAdapter {
  const base: AtsAdapter = {
    kind,
    matchesUrl: () => true,
    scanForm: (): FormModel => ({
      url: 'https://example.com',
      title: 'x',
      scannedAt: '2026-04-16T00:00:00.000Z',
      fields: [],
    }),
    fillField: (i: FillInstruction): FillResult => ({
      ok: true,
      selector: i.selector,
    }),
  };
  return Object.freeze({ ...base, ...over });
}

function makeDeps(
  over: Partial<AutofillControllerDeps> = {},
): AutofillControllerDeps {
  return {
    loadAdapter: async () => makeAdapter('greenhouse'),
    readProfile: async () => baseProfile(),
    resolveFile: async () => null,
    broadcastIntent: vi.fn(),
    logger: fakeLogger(),
    now: () => 1_713_000_000_000,
    document: docFor(),
    ...over,
  };
}

// ---------- Category 1: Null / undefined / NaN / Infinity ----------

describe('AutofillController adversarial -- null/undefined at boundaries', () => {
  it('returns profile-missing when readProfile resolves undefined cast as null', async () => {
    const controller = new AutofillController(
      makeDeps({
        readProfile: async () =>
          undefined as unknown as Profile | null,
      }),
    );
    const r = await controller.executeFill();
    expect(r).toMatchObject({ aborted: true, abortReason: 'profile-missing' });
  });

  it('returns no-adapter when loadAdapter rejects rather than returns null', async () => {
    const controller = new AutofillController(
      makeDeps({
        loadAdapter: async () => {
          throw new Error('loader crashed');
        },
      }),
    );
    const r = await controller.executeFill();
    expect(r).toMatchObject({ aborted: true, abortReason: 'no-adapter' });
  });

  it('treats NaN timestamp from now() without throwing', async () => {
    const controller = new AutofillController(
      makeDeps({
        now: () => Number.NaN,
      }),
    );
    const r = await controller.executeFill();
    // Either aborted no-form (empty adapter scan) or an ok response; it MUST
    // never throw. We assert the envelope shape is intact.
    expect(typeof r.ok).toBe('boolean');
  });

  it('survives Infinity timestamp from now()', async () => {
    const controller = new AutofillController(
      makeDeps({
        now: () => Number.POSITIVE_INFINITY,
      }),
    );
    const r = await controller.executeFill();
    expect(typeof r.ok).toBe('boolean');
  });
});

// ---------- Category 2: Empty + max-size collections ----------

describe('AutofillController adversarial -- empty and massive FormModel', () => {
  it('returns no-form for empty fields[] array', async () => {
    const adapter = makeAdapter('greenhouse', {
      scanForm: () => ({
        url: 'https://x.test',
        title: 't',
        scannedAt: '2026-04-16T00:00:00.000Z',
        fields: [],
      }),
    });
    const controller = new AutofillController(
      makeDeps({ loadAdapter: async () => adapter }),
    );
    const r = await controller.executeFill();
    expect(r).toMatchObject({ aborted: true, abortReason: 'no-form' });
  });

  it('completes for 1000-field FormModel under 2 seconds', async () => {
    const adapter = makeAdapter('greenhouse', {
      scanForm: () => ({
        url: 'https://x.test',
        title: 't',
        scannedAt: '2026-04-16T00:00:00.000Z',
        sourceATS: 'greenhouse',
        fields: Array.from({ length: 1000 }, (_unused, i) => ({
          selector: `#f_${i}`,
          htmlType: 'text' as const,
          name: `f_${i}`,
          id: `f_${i}`,
          label: `Label ${i}`,
        })),
      }),
      fillField: (i: FillInstruction): FillResult => ({
        ok: true,
        selector: i.selector,
      }),
    });
    const controller = new AutofillController(
      makeDeps({ loadAdapter: async () => adapter }),
    );
    const start = Date.now();
    const r = await controller.executeFill();
    const elapsed = Date.now() - start;
    expect(r.ok).toBe(true);
    expect(elapsed).toBeLessThan(2000);
  });
});

// ---------- Category 3: Unicode edge cases ----------

describe('AutofillController adversarial -- Unicode edge cases in profile', () => {
  it('RTL-marked first name lands verbatim in fillField', async () => {
    const rtlName = '\u202eJane\u202c';
    const seen: string[] = [];
    const adapter = makeAdapter('greenhouse', {
      scanForm: () => ({
        url: 'https://x.test',
        title: 't',
        scannedAt: '2026-04-16T00:00:00.000Z',
        sourceATS: 'greenhouse',
        fields: [
          {
            selector: '#first',
            htmlType: 'text' as const,
            name: 'job_application[first_name]',
            id: 'first',
            label: 'First',
          },
        ],
      }),
      fillField: (i: FillInstruction): FillResult => {
        seen.push(i.value);
        return { ok: true, selector: i.selector };
      },
    });
    const controller = new AutofillController(
      makeDeps({
        loadAdapter: async () => adapter,
        readProfile: async () => baseProfile({ firstName: rtlName }),
      }),
    );
    await controller.executeFill();
    expect(seen[0]).toBe(rtlName);
  });

  it('combining-char name preserved through the pipeline', async () => {
    const name = 'Jane\u0301';
    const seen: string[] = [];
    const adapter = makeAdapter('greenhouse', {
      scanForm: () => ({
        url: 'https://x.test',
        title: 't',
        scannedAt: '2026-04-16T00:00:00.000Z',
        sourceATS: 'greenhouse',
        fields: [
          {
            selector: '#first',
            htmlType: 'text' as const,
            name: 'job_application[first_name]',
            id: 'first',
            label: 'First',
          },
        ],
      }),
      fillField: (i: FillInstruction): FillResult => {
        seen.push(i.value);
        return { ok: true, selector: i.selector };
      },
    });
    const controller = new AutofillController(
      makeDeps({
        loadAdapter: async () => adapter,
        readProfile: async () => baseProfile({ firstName: name }),
      }),
    );
    await controller.executeFill();
    expect(seen[0]).toBe(name);
  });

  it('surrogate-pair emoji last name preserved', async () => {
    const last = 'Doe\ud83d\ude00';
    const seen: string[] = [];
    const adapter = makeAdapter('greenhouse', {
      scanForm: () => ({
        url: 'https://x.test',
        title: 't',
        scannedAt: '2026-04-16T00:00:00.000Z',
        sourceATS: 'greenhouse',
        fields: [
          {
            selector: '#last',
            htmlType: 'text' as const,
            name: 'job_application[last_name]',
            id: 'last',
            label: 'Last',
          },
        ],
      }),
      fillField: (i: FillInstruction): FillResult => {
        seen.push(i.value);
        return { ok: true, selector: i.selector };
      },
    });
    const controller = new AutofillController(
      makeDeps({
        loadAdapter: async () => adapter,
        readProfile: async () => baseProfile({ lastName: last }),
      }),
    );
    await controller.executeFill();
    expect(seen[0]).toBe(last);
  });
});

// ---------- Category 4: Injection ----------

describe('AutofillController adversarial -- injection payloads', () => {
  it('script tag in firstName is passed as literal string to fillField', async () => {
    const payload = '<script>alert(1)</script>';
    const received: string[] = [];
    const adapter = makeAdapter('greenhouse', {
      scanForm: () => ({
        url: 'https://x.test',
        title: 't',
        scannedAt: '2026-04-16T00:00:00.000Z',
        sourceATS: 'greenhouse',
        fields: [
          {
            selector: '#first',
            htmlType: 'text' as const,
            name: 'job_application[first_name]',
            id: 'first',
            label: 'First',
          },
        ],
      }),
      fillField: (i: FillInstruction): FillResult => {
        received.push(i.value);
        return { ok: true, selector: i.selector };
      },
    });
    const controller = new AutofillController(
      makeDeps({
        loadAdapter: async () => adapter,
        readProfile: async () => baseProfile({ firstName: payload }),
      }),
    );
    const r = await controller.executeFill();
    expect(r.ok).toBe(true);
    expect(received[0]).toBe(payload);
  });

  it('path-traversal-like value in lastName treated as literal', async () => {
    const payload = '../../etc/passwd';
    const received: string[] = [];
    const adapter = makeAdapter('greenhouse', {
      scanForm: () => ({
        url: 'https://x.test',
        title: 't',
        scannedAt: '2026-04-16T00:00:00.000Z',
        sourceATS: 'greenhouse',
        fields: [
          {
            selector: '#last',
            htmlType: 'text' as const,
            name: 'job_application[last_name]',
            id: 'last',
            label: 'Last',
          },
        ],
      }),
      fillField: (i: FillInstruction): FillResult => {
        received.push(i.value);
        return { ok: true, selector: i.selector };
      },
    });
    const controller = new AutofillController(
      makeDeps({
        loadAdapter: async () => adapter,
        readProfile: async () => baseProfile({ lastName: payload }),
      }),
    );
    const r = await controller.executeFill();
    expect(r.ok).toBe(true);
    expect(received[0]).toBe(payload);
  });

  it('SQL-style payload in email treated as literal string', async () => {
    const payload = `' OR 1=1 --@example.com`;
    const received: string[] = [];
    const adapter = makeAdapter('greenhouse', {
      scanForm: () => ({
        url: 'https://x.test',
        title: 't',
        scannedAt: '2026-04-16T00:00:00.000Z',
        sourceATS: 'greenhouse',
        fields: [
          {
            selector: '#email',
            htmlType: 'email' as const,
            name: 'email',
            id: 'email',
            label: 'Email',
            autocomplete: 'email',
          },
        ],
      }),
      fillField: (i: FillInstruction): FillResult => {
        received.push(i.value);
        return { ok: true, selector: i.selector };
      },
    });
    const controller = new AutofillController(
      makeDeps({
        loadAdapter: async () => adapter,
        readProfile: async () => baseProfile({ email: payload }),
      }),
    );
    await controller.executeFill();
    // email may be filtered by Zod elsewhere; here we assert the controller
    // did not execute or transform the payload.
    expect(received[0] === payload || received.length === 0).toBe(true);
  });
});

// ---------- Category 5: Concurrent re-entry ----------

describe('AutofillController adversarial -- concurrent executeFill', () => {
  it('two parallel executeFill calls each resolve to typed envelopes (single-flight adapter)', async () => {
    let loads = 0;
    const adapter = makeAdapter('greenhouse', {
      scanForm: () => ({
        url: 'https://x.test',
        title: 't',
        scannedAt: '2026-04-16T00:00:00.000Z',
        sourceATS: 'greenhouse',
        fields: [
          {
            selector: '#first',
            htmlType: 'text' as const,
            name: 'job_application[first_name]',
            id: 'first',
            label: 'First',
          },
        ],
      }),
      fillField: (i: FillInstruction): FillResult => ({
        ok: true,
        selector: i.selector,
      }),
    });
    const controller = new AutofillController(
      makeDeps({
        loadAdapter: async () => {
          loads += 1;
          return adapter;
        },
      }),
    );
    const [a, b] = await Promise.all([
      controller.executeFill(),
      controller.executeFill(),
    ]);
    expect(typeof a.ok).toBe('boolean');
    expect(typeof b.ok).toBe('boolean');
    expect(loads).toBe(1);
  });

  it('bootstrap then concurrent executeFill x4 all resolve to envelopes', async () => {
    const adapter = makeAdapter('greenhouse', {
      scanForm: () => ({
        url: 'https://x.test',
        title: 't',
        scannedAt: '2026-04-16T00:00:00.000Z',
        sourceATS: 'greenhouse',
        fields: [],
      }),
    });
    const controller = new AutofillController(
      makeDeps({ loadAdapter: async () => adapter }),
    );
    await controller.bootstrap();
    const results = await Promise.all([
      controller.executeFill(),
      controller.executeFill(),
      controller.executeFill(),
      controller.executeFill(),
    ]);
    expect(results).toHaveLength(4);
    for (const r of results) {
      expect(typeof r.ok).toBe('boolean');
    }
  });
});

// ---------- Category 6: Adversarial state ----------

describe('AutofillController adversarial -- frozen / Proxy / circular state', () => {
  it('works with a frozen profile object', async () => {
    const profile = Object.freeze(baseProfile()) as Profile;
    const controller = new AutofillController(
      makeDeps({ readProfile: async () => profile }),
    );
    const r = await controller.executeFill();
    expect(typeof r.ok).toBe('boolean');
  });

  it('returns aborted envelope (not throw) when document.location getter throws', async () => {
    const trapDoc = new Proxy(
      {},
      {
        get(_t: object, key: string | symbol): unknown {
          if (key === 'location') {
            throw new Error('boobytrapped location');
          }
          return undefined;
        },
      },
    ) as unknown as Document;
    const controller = new AutofillController(
      makeDeps({ document: trapDoc }),
    );
    // Contract: executeFill NEVER throws; every failure path returns a
    // typed FillRequestResponse envelope. Adversarial Proxy document must
    // not leak the getter exception to the caller.
    const r = await controller.executeFill();
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.aborted).toBe(true);
      expect(['no-adapter', 'no-form', 'scan-failed']).toContain(
        r.abortReason,
      );
    }
  });

  it('bootstrap swallows a Proxy-document getter exception (does not throw)', async () => {
    const trapDoc = new Proxy(
      {},
      {
        get(_t: object, key: string | symbol): unknown {
          if (key === 'location') {
            throw new Error('boobytrapped location');
          }
          return undefined;
        },
      },
    ) as unknown as Document;
    const controller = new AutofillController(
      makeDeps({ document: trapDoc }),
    );
    await expect(controller.bootstrap()).resolves.toBeUndefined();
  });

  it('adapter.fillField throwing is caught and mapped to write-failed', async () => {
    const adapter = makeAdapter('greenhouse', {
      scanForm: () => ({
        url: 'https://x.test',
        title: 't',
        scannedAt: '2026-04-16T00:00:00.000Z',
        sourceATS: 'greenhouse',
        fields: [
          {
            selector: '#first',
            htmlType: 'text' as const,
            name: 'job_application[first_name]',
            id: 'first',
            label: 'First',
          },
        ],
      }),
      fillField: (): FillResult => {
        throw new Error('adapter blew up');
      },
    });
    const controller = new AutofillController(
      makeDeps({ loadAdapter: async () => adapter }),
    );
    const r = await controller.executeFill();
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.failed.length).toBeGreaterThan(0);
      expect(r.failed[0]?.reason).toBe('write-failed');
    }
  });

  it('adapter.scanForm throwing with circular-reference-bearing payload is mapped to scan-failed', async () => {
    type Node = { self?: unknown };
    const circular: Node = {};
    circular.self = circular;
    const adapter = makeAdapter('greenhouse', {
      scanForm: () => {
        // Simulate an adapter that tries to stringify a circular object
        // internally and blows up. JSON.stringify on circular throws.
        JSON.stringify(circular);
        // unreachable; satisfy type-checker
        return {
          url: '',
          title: '',
          scannedAt: '',
          fields: [],
        };
      },
    });
    const controller = new AutofillController(
      makeDeps({ loadAdapter: async () => adapter }),
    );
    const r = await controller.executeFill();
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.abortReason).toBe('scan-failed');
    }
  });
});
