// SPDX-License-Identifier: MIT
import { describe, it, expect } from 'vitest';
import {
  jsonResumeToProfile,
  profileToJsonResume,
  roundTripProfile,
} from '../../../../src/background/profile/json-resume-converter';
import type { Profile } from '../../../../src/background/messaging/schemas/profile.schema';

function sample(): Profile {
  return {
    profileVersion: '1.0',
    updatedAtMs: 1,
    basics: {
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada@example.com',
      phone: '+44-20-555-0101',
      location: { city: 'London', region: '', countryCode: 'GB', postalCode: 'SW1A 1AA' },
      website: 'https://ada.example.com',
      linkedin: 'https://linkedin.com/in/ada',
      github: 'https://github.com/ada',
    },
    work: [
      {
        company: 'Analytical Engines Ltd',
        position: 'Architect',
        startDate: '1843-01',
        endDate: '1852-11',
        summary: 'Designed the first computer program.',
      },
    ],
    education: [
      {
        institution: 'Home Tutoring',
        area: 'Mathematics',
        studyType: 'Private',
        startDate: '1830',
        endDate: '1836',
      },
    ],
    skills: [{ name: 'Algorithms', level: 'expert', keywords: ['Bernoulli', 'Analytical Engine'] }],
  };
}

describe('profileToJsonResume', () => {
  it('renders a JSON Resume v1-ish object for a full profile', () => {
    const resume = profileToJsonResume(sample());
    expect(resume.basics.name).toBe('Ada Lovelace');
    expect(resume.basics.email).toBe('ada@example.com');
    expect(resume.basics.profiles).toHaveLength(2);
    expect(resume.work).toHaveLength(1);
  });

  it('renders an empty name when both halves are empty', () => {
    const p = sample();
    const empty: Profile = {
      ...p,
      basics: { ...p.basics, firstName: '', lastName: '' },
    };
    expect(profileToJsonResume(empty).basics.name).toBe('');
  });

  it('omits linkedin/github from profiles when empty', () => {
    const p = sample();
    const noSocial: Profile = {
      ...p,
      basics: { ...p.basics, linkedin: '', github: '' },
    };
    expect(profileToJsonResume(noSocial).basics.profiles).toHaveLength(0);
  });
});

describe('round-trip', () => {
  it('recovers core fields when converted forward and back', () => {
    const original = sample();
    const r = roundTripProfile(original, 999);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.profile.basics.email).toBe('ada@example.com');
      expect(r.profile.basics.firstName).toBe('Ada');
      expect(r.profile.basics.lastName).toBe('Lovelace');
      expect(r.profile.work).toHaveLength(1);
      expect(r.profile.skills[0]?.keywords).toContain('Bernoulli');
    }
  });

  it('survives unicode names', () => {
    const p = sample();
    const uni: Profile = {
      ...p,
      basics: { ...p.basics, firstName: 'Ádá', lastName: 'Łövéłącé' },
    };
    const r = roundTripProfile(uni, 1);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.profile.basics.firstName).toBe('Ádá');
      expect(r.profile.basics.lastName).toBe('Łövéłącé');
    }
  });
});

describe('jsonResumeToProfile edge cases', () => {
  it('handles an empty object', () => {
    const r = jsonResumeToProfile({}, 1);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.profile.basics.email).toBe('unknown@example.com');
    }
  });

  it('handles a non-string work field gracefully', () => {
    const r = jsonResumeToProfile(
      { basics: { name: 'X Y', email: 'x@y.com' }, work: [{ company: 123 }] },
      1,
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.profile.work[0]?.company).toBe('');
    }
  });

  it('maps `name` field from work entries when `company` is absent', () => {
    const r = jsonResumeToProfile(
      { basics: { name: 'X Y', email: 'x@y.com' }, work: [{ name: 'Acme', position: 'Eng', startDate: '', endDate: '' }] },
      1,
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.profile.work[0]?.company).toBe('Acme');
    }
  });

  it('handles unicode strings', () => {
    const r = jsonResumeToProfile({ basics: { name: 'Ádá Łöv', email: 'u@u.com' } }, 1);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.profile.basics.firstName).toBe('Ádá');
    }
  });
});
