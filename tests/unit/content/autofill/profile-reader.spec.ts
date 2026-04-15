// SPDX-License-Identifier: MIT
/**
 * Unit tests for profile-reader.ts (post-101 backend master-resume variant).
 */

import { describe, it, expect, vi } from 'vitest';
import {
  readProfile,
  isEmptyProfile,
  type ProfileReaderDeps,
} from '@/src/content/autofill/profile-reader';
import type { Profile } from 'ats-autofill-engine/profile';
import type { Logger } from '@/src/background/log';
import type { MasterResumeGetResponse } from '@/src/background/master-resume';

function makeFakeLogger(): Logger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

function depsWithResponse(
  response: MasterResumeGetResponse,
  logger: Logger = makeFakeLogger(),
): ProfileReaderDeps {
  return {
    logger,
    now: () => 1_713_000_000_000,
    requestMasterResume: vi.fn(async () => response),
  };
}

describe('readProfile - happy path', () => {
  it('maps JSON Resume-shaped structuredData to a Profile', async () => {
    const deps = depsWithResponse({
      ok: true,
      resume: {
        userId: 'u',
        label: 'Master',
        rawText: 'Ada Lovelace\nada@example.com',
        structuredData: {
          basics: {
            name: 'Ada Lovelace',
            email: 'ada@example.com',
            phone: '+441234567890',
          },
          work: [],
          education: [],
          skills: [],
        },
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    });
    const result = await readProfile(deps);
    expect(result).not.toBeNull();
    expect(result?.basics.email).toBe('ada@example.com');
  });

  it('normalises Rx Resume-shaped structuredData (sections wrapper)', async () => {
    const deps = depsWithResponse({
      ok: true,
      resume: {
        userId: 'u',
        label: 'Master',
        rawText: 'text',
        structuredData: {
          sections: {
            basics: {
              items: [
                {
                  name: 'Grace Hopper',
                  email: 'grace@example.com',
                },
              ],
            },
          },
        },
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    });
    const result = await readProfile(deps);
    expect(result).not.toBeNull();
    expect(result?.basics.email).toBe('grace@example.com');
  });
});

describe('readProfile - failure paths', () => {
  it('returns null when backend reports not-found (resume null)', async () => {
    const deps = depsWithResponse({ ok: true, resume: null });
    expect(await readProfile(deps)).toBeNull();
  });

  it('returns null when backend reports unauthenticated', async () => {
    const deps = depsWithResponse({ ok: false, reason: 'unauthenticated' });
    expect(await readProfile(deps)).toBeNull();
  });

  it('returns null when backend reports network-error', async () => {
    const deps = depsWithResponse({ ok: false, reason: 'network-error' });
    expect(await readProfile(deps)).toBeNull();
  });

  it('returns null when structuredData is missing', async () => {
    const deps = depsWithResponse({
      ok: true,
      resume: {
        userId: 'u',
        label: 'Master',
        rawText: 'text',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    });
    expect(await readProfile(deps)).toBeNull();
  });

  it('returns null when structuredData has neither JSON Resume nor Rx shape', async () => {
    const deps = depsWithResponse({
      ok: true,
      resume: {
        userId: 'u',
        label: 'Master',
        rawText: 'text',
        structuredData: { something: 'else' },
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    });
    expect(await readProfile(deps)).toBeNull();
  });

  it('returns null when requestMasterResume throws', async () => {
    const logger = makeFakeLogger();
    const deps: ProfileReaderDeps = {
      logger,
      now: () => 0,
      requestMasterResume: vi.fn(async () => {
        throw new Error('runtime closed');
      }),
    };
    expect(await readProfile(deps)).toBeNull();
    expect(logger.error).toHaveBeenCalled();
  });
});

describe('isEmptyProfile', () => {
  it('returns true for null', () => {
    expect(isEmptyProfile(null)).toBe(true);
  });

  it('returns false for profile with firstName', () => {
    const p = {
      profileVersion: '1.0',
      updatedAtMs: 0,
      basics: { firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com' },
      work: [],
      education: [],
      skills: [],
    } as unknown as Profile;
    expect(isEmptyProfile(p)).toBe(false);
  });

  it('returns true for profile with only whitespace firstName and email', () => {
    const p = {
      profileVersion: '1.0',
      updatedAtMs: 0,
      basics: { firstName: '   ', lastName: '', email: '   ' },
      work: [],
      education: [],
      skills: [],
    } as unknown as Profile;
    expect(isEmptyProfile(p)).toBe(true);
  });

  it('returns false when email present without firstName', () => {
    const p = {
      profileVersion: '1.0',
      updatedAtMs: 0,
      basics: { firstName: '', lastName: '', email: 'a@b.com' },
      work: [],
      education: [],
      skills: [],
    } as unknown as Profile;
    expect(isEmptyProfile(p)).toBe(false);
  });
});
