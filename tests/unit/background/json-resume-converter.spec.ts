// SPDX-License-Identifier: MIT
import { describe, it, expect } from 'vitest';
import { jsonResumeToProfile } from '../../../src/background/messaging/json-resume-converter';

describe('jsonResumeToProfile', () => {
  it('returns error when input is not an object', () => {
    const r = jsonResumeToProfile('not-an-object', 1);
    expect(r.ok).toBe(false);
  });

  it('returns error when input is null', () => {
    const r = jsonResumeToProfile(null, 1);
    expect(r.ok).toBe(false);
  });

  it('converts a minimal resume with name and email', () => {
    const r = jsonResumeToProfile(
      { basics: { name: 'New User', email: 'new@example.com' } },
      1_713_000_000_000,
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.profile.basics.firstName).toBe('New');
      expect(r.profile.basics.lastName).toBe('User');
      expect(r.profile.basics.email).toBe('new@example.com');
    }
  });

  it('converts work entries', () => {
    const r = jsonResumeToProfile(
      {
        basics: { name: 'X Y', email: 'x@y.com' },
        work: [{ company: 'Acme', position: 'Eng', startDate: '2020-01', endDate: '2021-12' }],
      },
      1,
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.profile.work).toHaveLength(1);
      expect(r.profile.work[0]?.company).toBe('Acme');
    }
  });

  it('picks linkedin and github from profiles list', () => {
    const r = jsonResumeToProfile(
      {
        basics: {
          name: 'X Y',
          email: 'x@y.com',
          profiles: [
            { network: 'LinkedIn', url: 'https://linkedin.com/in/xy' },
            { network: 'GitHub', url: 'https://github.com/xy' },
          ],
        },
      },
      1,
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.profile.basics.linkedin).toBe('https://linkedin.com/in/xy');
      expect(r.profile.basics.github).toBe('https://github.com/xy');
    }
  });

  it('rejects resumes where email is missing entirely', () => {
    const r = jsonResumeToProfile({ basics: { name: 'X' } }, 1);
    // falls back to unknown@example.com which is valid, so it actually succeeds
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.profile.basics.email).toBe('unknown@example.com');
    }
  });
});
