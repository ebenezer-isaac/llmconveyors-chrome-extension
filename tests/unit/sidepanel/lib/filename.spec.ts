// SPDX-License-Identifier: MIT
import { describe, it, expect } from 'vitest';
import {
  buildArtifactFilename,
  extractNamingMetadata,
  defaultFilenameForType,
} from '@/entrypoints/sidepanel/lib/filename';

describe('sidepanel filename helper', () => {
  describe('buildArtifactFilename', () => {
    it('assembles Full_Company_Role_Suffix.ext when all fields present', () => {
      expect(
        buildArtifactFilename(
          { fullName: 'Jane Doe', companyName: 'Meta', jobTitle: 'Staff SWE' },
          'Resume',
          'pdf',
        ),
      ).toBe('Jane_Doe_Meta_Staff_SWE_Resume.pdf');
    });

    it('falls back to suffix.ext when no naming fields are provided', () => {
      expect(buildArtifactFilename({}, 'Cold_Email', 'txt')).toBe('Cold_Email.txt');
    });

    it('strips punctuation and collapses whitespace', () => {
      expect(
        buildArtifactFilename(
          { fullName: "O'Brien, Connor!", companyName: 'Acme, Inc.' },
          'Resume',
          'pdf',
        ),
      ).toBe('OBrien_Connor_Acme_Inc_Resume.pdf');
    });

    it('truncates each segment to 40 characters', () => {
      const long = 'A'.repeat(60);
      const out = buildArtifactFilename({ fullName: long }, 'Resume', 'pdf');
      expect(out).toBe(`${'A'.repeat(40)}_Resume.pdf`);
    });
  });

  describe('extractNamingMetadata', () => {
    it('returns empty object for null / undefined metadata', () => {
      expect(extractNamingMetadata(null)).toEqual({});
      expect(extractNamingMetadata(undefined)).toEqual({});
    });

    it('only picks non-empty string fields', () => {
      expect(
        extractNamingMetadata({
          fullName: 'Jane',
          companyName: '',
          jobTitle: 42,
          other: 'ignored',
        }),
      ).toEqual({ fullName: 'Jane' });
    });

    it('trims whitespace-only fields', () => {
      expect(extractNamingMetadata({ fullName: '   ' })).toEqual({});
    });
  });

  describe('defaultFilenameForType', () => {
    it('maps known types to their canonical suffix', () => {
      expect(defaultFilenameForType('cv', 'application/pdf')).toEqual({
        suffix: 'Resume',
        ext: 'pdf',
      });
      expect(defaultFilenameForType('cover-letter', 'text/plain')).toEqual({
        suffix: 'Cover_Letter',
        ext: 'txt',
      });
      expect(defaultFilenameForType('cold-email', 'text/markdown')).toEqual({
        suffix: 'Cold_Email',
        ext: 'md',
      });
      expect(defaultFilenameForType('ats-comparison', 'application/json')).toEqual({
        suffix: 'ATS_Report',
        ext: 'json',
      });
    });

    it('sanitizes unknown types and defaults to txt extension', () => {
      expect(defaultFilenameForType('weird/type.with!chars', null)).toEqual({
        suffix: 'weird_type_with_chars',
        ext: 'txt',
      });
    });
  });
});
