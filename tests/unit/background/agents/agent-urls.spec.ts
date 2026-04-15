// SPDX-License-Identifier: MIT
import { describe, it, expect } from 'vitest';
import { AGENT_REGISTRY, buildAgentUrl } from '@/src/background/agents';

const jobHunter = AGENT_REGISTRY['job-hunter'];
const b2bSales = AGENT_REGISTRY['b2b-sales'];
const opts = { rootDomain: 'llmconveyors.com', locale: 'en' } as const;

describe('buildAgentUrl', () => {
  describe('settings', () => {
    it('returns the settings URL for job-hunter', () => {
      expect(buildAgentUrl(jobHunter, 'settings', opts)).toBe(
        'https://job-hunt.llmconveyors.com/en/settings',
      );
    });

    it('returns the settings URL for b2b-sales', () => {
      expect(buildAgentUrl(b2bSales, 'settings', opts)).toBe(
        'https://b2b-sales.llmconveyors.com/en/settings',
      );
    });
  });

  describe('resume', () => {
    it('returns the resume URL for job-hunter', () => {
      expect(buildAgentUrl(jobHunter, 'resume', opts)).toBe(
        'https://job-hunt.llmconveyors.com/en/settings/resume',
      );
    });

    it('returns null for b2b-sales (no resume concept)', () => {
      expect(buildAgentUrl(b2bSales, 'resume', opts)).toBeNull();
    });
  });

  describe('dashboard', () => {
    it('returns the dashboard URL for job-hunter without trailing slash', () => {
      expect(buildAgentUrl(jobHunter, 'dashboard', opts)).toBe(
        'https://job-hunt.llmconveyors.com/en',
      );
    });

    it('returns the dashboard URL for b2b-sales without trailing slash', () => {
      expect(buildAgentUrl(b2bSales, 'dashboard', opts)).toBe(
        'https://b2b-sales.llmconveyors.com/en',
      );
    });
  });

  describe('scheme override', () => {
    it('uses http when scheme is http', () => {
      expect(
        buildAgentUrl(jobHunter, 'settings', { ...opts, scheme: 'http' }),
      ).toBe('http://job-hunt.llmconveyors.com/en/settings');
    });

    it('defaults to https when scheme is omitted', () => {
      expect(buildAgentUrl(jobHunter, 'settings', opts)).toMatch(/^https:\/\//);
    });
  });

  describe('locale substitution', () => {
    it('splices locale into all URL kinds', () => {
      const frOpts = { rootDomain: 'llmconveyors.com', locale: 'fr' };
      expect(buildAgentUrl(jobHunter, 'dashboard', frOpts)).toBe(
        'https://job-hunt.llmconveyors.com/fr',
      );
      expect(buildAgentUrl(jobHunter, 'settings', frOpts)).toBe(
        'https://job-hunt.llmconveyors.com/fr/settings',
      );
      expect(buildAgentUrl(jobHunter, 'resume', frOpts)).toBe(
        'https://job-hunt.llmconveyors.com/fr/settings/resume',
      );
    });
  });

  describe('rootDomain substitution', () => {
    it('uses staging domain when provided', () => {
      const stagingOpts = { rootDomain: 'staging.llmconveyors.com', locale: 'en' };
      expect(buildAgentUrl(jobHunter, 'settings', stagingOpts)).toBe(
        'https://job-hunt.staging.llmconveyors.com/en/settings',
      );
    });
  });
});
