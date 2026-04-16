// SPDX-License-Identifier: MIT
import { describe, it, expect } from 'vitest';
import { normalizeArtifactPreview } from '@/src/background/messaging/schemas/artifact-preview.schema';

describe('normalizeArtifactPreview', () => {
  it('maps a cover-letter artifact to the cover-letter type with its content', () => {
    const out = normalizeArtifactPreview(
      {
        type: 'cover-letter',
        content: 'Dear Sir or Madam',
        mimeType: 'text/plain',
        storageKey: 'keys/a.txt',
      },
      'Cover_Letter.txt',
    );
    expect(out).not.toBeNull();
    expect(out?.type).toBe('cover-letter');
    expect(out?.content).toBe('Dear Sir or Madam');
    expect(out?.filename).toBe('Cover_Letter.txt');
  });

  it('collapses unknown type values to "other" with a default label', () => {
    const out = normalizeArtifactPreview(
      { kind: 'weird/type', content: 'x' },
      'Artifact.txt',
    );
    expect(out?.type).toBe('other');
    expect(out?.label).toBe('Artifact');
  });

  it('returns null when the entry has no content, no download URL, and no storage key', () => {
    const out = normalizeArtifactPreview({ type: 'cv' }, 'Resume.pdf');
    expect(out).toBeNull();
  });

  it('prefers explicit label over name over type-derived default', () => {
    expect(
      normalizeArtifactPreview(
        { type: 'cv', label: 'CV v2', content: 'x' },
        'f.pdf',
      )?.label,
    ).toBe('CV v2');
    expect(
      normalizeArtifactPreview(
        { type: 'cover-letter', name: 'final-draft', content: 'x' },
        'f.txt',
      )?.label,
    ).toBe('final-draft');
    expect(
      normalizeArtifactPreview({ type: 'cold-email', content: 'x' }, 'f.txt')
        ?.label,
    ).toBe('Cold Email');
  });

  it('maps common aliases: resume -> cv, letter -> cover-letter, outreach -> cold-email', () => {
    expect(
      normalizeArtifactPreview({ type: 'resume', content: 'x' }, 'f.pdf')?.type,
    ).toBe('cv');
    expect(
      normalizeArtifactPreview({ type: 'letter', content: 'x' }, 'f.txt')?.type,
    ).toBe('cover-letter');
    expect(
      normalizeArtifactPreview({ type: 'outreach', content: 'x' }, 'f.txt')?.type,
    ).toBe('cold-email');
    expect(
      normalizeArtifactPreview(
        { type: 'company-research', content: 'x' },
        'f.txt',
      )?.type,
    ).toBe('deep-research');
    expect(
      normalizeArtifactPreview({ type: 'ats-report', content: 'x' }, 'f.json')
        ?.type,
    ).toBe('ats-comparison');
  });

  it('carries through payload for type-specific bodies (ATS, cold-email)', () => {
    const out = normalizeArtifactPreview(
      {
        type: 'ats-comparison',
        payload: { before: { score: 10 }, after: { score: 35 } },
        content: '{}',
      },
      'ATS_Report.json',
    );
    expect(out?.payload).toEqual({ before: { score: 10 }, after: { score: 35 } });
  });

  it('captures pdfStorageKey + sessionId so the CV card can fetch its PDF', () => {
    const out = normalizeArtifactPreview(
      {
        type: 'cv',
        storageKey: 'users/u/sessions/s/cv.json',
        pdfStorageKey: 'users/u/sessions/s/cv.pdf',
      },
      'Resume.pdf',
      'sess-1',
    );
    expect(out?.pdfStorageKey).toBe('users/u/sessions/s/cv.pdf');
    expect(out?.sessionId).toBe('sess-1');
  });

  it('accepts a CV artifact with ONLY a pdfStorageKey (no JSON storageKey)', () => {
    const out = normalizeArtifactPreview(
      { type: 'cv', pdfStorageKey: 'users/u/sessions/s/cv.pdf' },
      'Resume.pdf',
      'sess-1',
    );
    expect(out).not.toBeNull();
    expect(out?.pdfStorageKey).toBe('users/u/sessions/s/cv.pdf');
    expect(out?.storageKey).toBeNull();
  });
});
