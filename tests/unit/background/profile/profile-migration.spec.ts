// SPDX-License-Identifier: MIT
import { describe, it, expect, vi } from 'vitest';
import { migrateProfile, CURRENT_PROFILE_VERSION } from '../../../../src/background/profile/profile-migration';

function makeLogger(): {
  info: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
  debug: ReturnType<typeof vi.fn>;
} {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
}

describe('migrateProfile', () => {
  it('returns null for null/undefined', () => {
    expect(migrateProfile(undefined, { logger: makeLogger() })).toBeNull();
    expect(migrateProfile(null, { logger: makeLogger() })).toBeNull();
  });

  it('returns null for non-object values', () => {
    expect(migrateProfile('str', { logger: makeLogger() })).toBeNull();
    expect(migrateProfile(42, { logger: makeLogger() })).toBeNull();
  });

  it('returns null for arrays', () => {
    expect(migrateProfile([1, 2], { logger: makeLogger() })).toBeNull();
  });

  it('returns null when profileVersion is missing', () => {
    const log = makeLogger();
    expect(migrateProfile({}, { logger: log })).toBeNull();
    expect(log.warn).toHaveBeenCalled();
  });

  it('returns null for unsupported versions', () => {
    const log = makeLogger();
    const result = migrateProfile({ profileVersion: '9.9' }, { logger: log });
    expect(result).toBeNull();
    expect(log.warn).toHaveBeenCalled();
  });

  it('passes v1.0 records through unchanged', () => {
    const raw = { profileVersion: '1.0', basics: { firstName: 'X' } };
    const result = migrateProfile(raw, { logger: makeLogger() });
    expect(result).toEqual(raw);
  });

  it('exports CURRENT_PROFILE_VERSION as 1.0', () => {
    expect(CURRENT_PROFILE_VERSION).toBe('1.0');
  });
});
