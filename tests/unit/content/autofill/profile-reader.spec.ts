// SPDX-License-Identifier: MIT
/**
 * Unit tests for profile-reader.ts.
 */

import { describe, it, expect, vi } from 'vitest';
import type { Mock } from 'vitest';
import {
  readProfile,
  isEmptyProfile,
  PROFILE_STORAGE_KEY,
  type ProfileReaderDeps,
} from '@/src/content/autofill/profile-reader';
import type { Profile } from 'ats-autofill-engine/profile';
import type { Logger } from '@/src/background/log';

function makeFakeLogger(): Logger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

function makeRealisticProfile(): Profile {
  return {
    profileVersion: '1.0',
    updatedAtMs: 1_713_000_000_000,
    basics: {
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada@example.com',
      phone: '+441234567890',
    },
    work: [],
    education: [],
    skills: [],
  } as Profile;
}

describe('readProfile - happy path', () => {
  it('returns a Profile when storage has a valid record', async () => {
    const profile = makeRealisticProfile();
    const storageGet: Mock = vi.fn(async () => ({
      [PROFILE_STORAGE_KEY]: profile,
    }));
    const deps: ProfileReaderDeps = { logger: makeFakeLogger(), storageGet };
    const result = await readProfile(deps);
    expect(result).not.toBeNull();
    expect(result?.basics.firstName).toBe('Ada');
    expect(result?.basics.email).toBe('ada@example.com');
    expect(result?.profileVersion).toBe('1.0');
  });
});

describe('readProfile - failure paths', () => {
  it('returns null when storage has no key', async () => {
    const storageGet: Mock = vi.fn(async () => ({}));
    const deps: ProfileReaderDeps = { logger: makeFakeLogger(), storageGet };
    expect(await readProfile(deps)).toBeNull();
  });

  it('returns null when storage returns undefined for the key', async () => {
    const storageGet: Mock = vi.fn(async () => ({
      [PROFILE_STORAGE_KEY]: undefined,
    }));
    const deps: ProfileReaderDeps = { logger: makeFakeLogger(), storageGet };
    expect(await readProfile(deps)).toBeNull();
  });

  it('returns null when stored record is null', async () => {
    const storageGet: Mock = vi.fn(async () => ({
      [PROFILE_STORAGE_KEY]: null,
    }));
    const deps: ProfileReaderDeps = { logger: makeFakeLogger(), storageGet };
    expect(await readProfile(deps)).toBeNull();
  });

  it('returns null when stored record fails ProfileSchema validation', async () => {
    const storageGet: Mock = vi.fn(async () => ({
      [PROFILE_STORAGE_KEY]: { profileVersion: 'not-a-version', basics: {} },
    }));
    const logger = makeFakeLogger();
    const deps: ProfileReaderDeps = { logger, storageGet };
    expect(await readProfile(deps)).toBeNull();
    expect(logger.warn).toHaveBeenCalled();
  });

  it('returns null when storage.get rejects', async () => {
    const storageGet: Mock = vi.fn(async () => {
      throw new Error('quota exceeded');
    });
    const logger = makeFakeLogger();
    const deps: ProfileReaderDeps = { logger, storageGet };
    expect(await readProfile(deps)).toBeNull();
    expect(logger.error).toHaveBeenCalled();
  });

  it('returns null for v1-shape legacy record (no profileVersion)', async () => {
    const storageGet: Mock = vi.fn(async () => ({
      [PROFILE_STORAGE_KEY]: {
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'ada@example.com',
      },
    }));
    const deps: ProfileReaderDeps = { logger: makeFakeLogger(), storageGet };
    expect(await readProfile(deps)).toBeNull();
  });
});

describe('isEmptyProfile', () => {
  it('returns true for null', () => {
    expect(isEmptyProfile(null)).toBe(true);
  });

  it('returns false for profile with firstName', () => {
    const p = makeRealisticProfile();
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
