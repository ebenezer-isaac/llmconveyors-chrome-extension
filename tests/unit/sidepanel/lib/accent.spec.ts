// SPDX-License-Identifier: MIT
import { describe, it, expect } from 'vitest';
import { accentFor, ACCENT_CLASSES } from '@/entrypoints/sidepanel/lib/accent';

describe('accent classes', () => {
  it('returns emerald bundle for job-hunter', () => {
    const accent = accentFor('job-hunter');
    expect(accent.border).toContain('emerald');
    expect(accent.header).toContain('emerald');
    expect(accent.button).toContain('emerald');
    expect(accent.phaseDot).toBe('bg-emerald-500');
  });

  it('returns purple bundle for b2b-sales', () => {
    const accent = accentFor('b2b-sales');
    expect(accent.border).toContain('purple');
    expect(accent.header).toContain('purple');
    expect(accent.button).toContain('purple');
    expect(accent.phaseDot).toBe('bg-purple-500');
  });

  it('falls back to neutral when the agent id is null', () => {
    const accent = accentFor(null);
    expect(accent.border).toContain('zinc');
    expect(accent.header).toContain('zinc');
  });

  it('exposes exactly the two known agent ids in ACCENT_CLASSES', () => {
    expect(Object.keys(ACCENT_CLASSES).sort()).toEqual(['b2b-sales', 'job-hunter']);
  });
});
