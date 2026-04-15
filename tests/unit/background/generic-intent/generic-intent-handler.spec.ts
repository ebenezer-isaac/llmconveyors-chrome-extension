// SPDX-License-Identifier: MIT
import { describe, it, expect, vi } from 'vitest';
import { createGenericIntentHandler } from '../../../../src/background/generic-intent/generic-intent-handler';

function logger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
}

describe('GENERIC_INTENT_DETECT handler', () => {
  it('rejects invalid payload', async () => {
    const h = createGenericIntentHandler({
      logger: logger(),
      scripting: {
        executeScript: vi.fn() as never,
      },
    });
    const r = await h({ data: { tabId: -1, agent: 'job-hunter' } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('invalid-payload');
  });

  it('returns ok with parsed job-description result', async () => {
    const inject = vi.fn(async () => [
      {
        result: {
          ok: true,
          result: {
            kind: 'job-description',
            text: 'A long job description of sufficient length.',
            method: 'jsonld',
            url: 'https://example.com/careers/1',
          },
        },
      },
    ]);
    const h = createGenericIntentHandler({
      logger: logger(),
      scripting: { executeScript: inject as never },
    });
    const r = await h({ data: { tabId: 1, agent: 'job-hunter' } });
    expect(r.ok).toBe(true);
    if (r.ok && r.result.kind === 'job-description') {
      expect(r.result.method).toBe('jsonld');
    }
  });

  it('maps permission error to permission-denied', async () => {
    const inject = vi.fn(async () => {
      throw new Error('Cannot access chrome://extensions');
    });
    const h = createGenericIntentHandler({
      logger: logger(),
      scripting: { executeScript: inject as never },
    });
    const r = await h({ data: { tabId: 1, agent: 'job-hunter' } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('permission-denied');
  });

  it('returns no-match when script says ok:false', async () => {
    const inject = vi.fn(async () => [{ result: { ok: false, reason: 'no-match' } }]);
    const h = createGenericIntentHandler({
      logger: logger(),
      scripting: { executeScript: inject as never },
    });
    const r = await h({ data: { tabId: 1, agent: 'b2b-sales' } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('no-match');
  });
});
