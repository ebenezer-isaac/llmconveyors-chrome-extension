// SPDX-License-Identifier: MIT
/**
 * Canonical Profile used by every integration test. Conforms to the Profile
 * schema published at A7 (blueprint: src/background/profile/blueprint.ts).
 * Every field is filled; tests that need a minimal profile use `minimalProfile()`.
 */

export interface ProfileLocation {
  readonly city: string;
  readonly region: string;
  readonly countryCode: string;
  readonly postalCode: string;
}

export interface ProfileBasics {
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string;
  readonly phone: string;
  readonly location: ProfileLocation;
  readonly website: string;
  readonly linkedin: string;
  readonly github: string;
}

export interface ProfileWorkEntry {
  readonly company: string;
  readonly position: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly summary?: string;
  readonly highlights?: readonly string[];
}

export interface ProfileEducationEntry {
  readonly institution: string;
  readonly area: string;
  readonly studyType: string;
  readonly startDate: string;
  readonly endDate: string;
}

export interface ProfileSkill {
  readonly name: string;
  readonly level: string;
  readonly keywords: readonly string[];
}

export interface CanonicalProfile {
  readonly profileVersion: string;
  readonly updatedAtMs: number;
  readonly basics: ProfileBasics;
  readonly work: readonly ProfileWorkEntry[];
  readonly education: readonly ProfileEducationEntry[];
  readonly skills: readonly ProfileSkill[];
}

export const CANONICAL_PROFILE: CanonicalProfile = Object.freeze({
  profileVersion: '1.0',
  updatedAtMs: 1_713_000_000_000,
  basics: Object.freeze({
    firstName: 'Jane',
    lastName: 'Doe',
    email: 'jane.doe@example.com',
    phone: '+1-415-555-0101',
    location: Object.freeze({
      city: 'San Francisco',
      region: 'CA',
      countryCode: 'US',
      postalCode: '94103',
    }),
    website: 'https://janedoe.example.com',
    linkedin: 'https://linkedin.com/in/janedoe',
    github: 'https://github.com/janedoe',
  }),
  work: Object.freeze([
    Object.freeze({
      company: 'Acme Corp',
      position: 'Senior Software Engineer',
      startDate: '2022-01',
      endDate: 'Present',
      summary: 'Led backend for payments platform.',
      highlights: Object.freeze([
        'Designed event-sourced ledger handling 2B transactions/year',
        'Reduced p99 latency from 800ms to 120ms',
      ]),
    }),
  ]),
  education: Object.freeze([
    Object.freeze({
      institution: 'UC Berkeley',
      area: 'Computer Science',
      studyType: 'BS',
      startDate: '2016-09',
      endDate: '2020-05',
    }),
  ]),
  skills: Object.freeze([
    Object.freeze({
      name: 'TypeScript',
      level: 'expert',
      keywords: Object.freeze(['Node.js', 'React']),
    }),
    Object.freeze({
      name: 'Go',
      level: 'proficient',
      keywords: Object.freeze(['gRPC', 'Kubernetes']),
    }),
  ]),
});

/**
 * A profile missing optional fields for edge-case tests.
 */
export function minimalProfile(): CanonicalProfile {
  return {
    profileVersion: '1.0',
    updatedAtMs: 1_713_000_000_000,
    basics: {
      firstName: 'Min',
      lastName: 'Imal',
      email: 'min@example.com',
      phone: '',
      location: { city: '', region: '', countryCode: '', postalCode: '' },
      website: '',
      linkedin: '',
      github: '',
    },
    work: [],
    education: [],
    skills: [],
  };
}

/**
 * Deep clone for tests that mutate the profile; returns a mutable copy.
 */
export function cloneProfile(p: CanonicalProfile = CANONICAL_PROFILE): CanonicalProfile {
  return JSON.parse(JSON.stringify(p)) as CanonicalProfile;
}

/**
 * chrome.storage.local key for Profile persistence (A7 contract).
 */
export const PROFILE_STORAGE_KEY = 'llmc.profile.v1';
