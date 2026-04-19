// SPDX-License-Identifier: MIT
/**
 * Adversarial tests for AtsComparisonBody. Intentionally try to break the
 * renderer with malformed / hostile / edge-case payloads to catch
 * crashes, XSS sinks, and silent data corruption.
 */

// React auto-injected
import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { AtsComparisonBody } from '@/entrypoints/sidepanel/artifacts/AtsComparisonBody';
import type { ArtifactPreview } from '@/src/background/messaging/schemas/artifact-preview.schema';

function atsArtifact(payload: unknown): ArtifactPreview {
  return {
    type: 'ats-comparison',
    label: 'ATS Comparison',
    content: null,
    mimeType: 'application/json',
    downloadUrl: null,
    storageKey: null,
    pdfStorageKey: null,
    sessionId: null,
    filename: 'ats.json',
    payload: payload as Record<string, unknown>,
  };
}

function fullScore(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    overallScore: 75,
    grade: 'B',
    matchedKeywords: [],
    missingKeywords: [],
    ...overrides,
  };
}

describe('AtsComparisonBody adversarial', () => {
  afterEach(() => cleanup());

  describe('malformed payload rejection', () => {
    it('renders unparseable fallback when payload is null', () => {
      render(<AtsComparisonBody artifact={atsArtifact(null)} open={true} />);
      expect(screen.queryByTestId('artifact-body-ats-unparseable')).toBeTruthy();
      expect(screen.queryByTestId('artifact-body-ats')).toBeNull();
    });

    it('renders unparseable fallback when payload is missing before', () => {
      render(
        <AtsComparisonBody
          artifact={atsArtifact({ after: fullScore(), improvement: 5 })}
          open={true}
        />,
      );
      expect(screen.queryByTestId('artifact-body-ats-unparseable')).toBeTruthy();
    });

    it('renders unparseable fallback when payload is missing after', () => {
      render(
        <AtsComparisonBody
          artifact={atsArtifact({ before: fullScore(), improvement: 5 })}
          open={true}
        />,
      );
      expect(screen.queryByTestId('artifact-body-ats-unparseable')).toBeTruthy();
    });

    it('renders unparseable fallback when overallScore is a string', () => {
      render(
        <AtsComparisonBody
          artifact={atsArtifact({
            before: { ...fullScore(), overallScore: '60' },
            after: fullScore(),
          })}
          open={true}
        />,
      );
      expect(screen.queryByTestId('artifact-body-ats-unparseable')).toBeTruthy();
    });

    it('falls back to malformed JSON in content', () => {
      render(
        <AtsComparisonBody
          artifact={{
            ...atsArtifact(null),
            content: '{not valid json',
          }}
          open={true}
        />,
      );
      expect(screen.queryByTestId('artifact-body-ats-unparseable')).toBeTruthy();
    });

    it('parses JSON content when payload is absent', () => {
      const payload = JSON.stringify({
        before: fullScore({ overallScore: 50, grade: 'C' }),
        after: fullScore({ overallScore: 80, grade: 'A' }),
        improvement: 30,
      });
      render(
        <AtsComparisonBody
          artifact={{
            ...atsArtifact(null),
            payload: undefined as unknown as Record<string, unknown>,
            content: payload,
          }}
          open={true}
        />,
      );
      expect(screen.queryByTestId('artifact-body-ats')).toBeTruthy();
    });

    it('parses nested wrapper payload shape', () => {
      render(
        <AtsComparisonBody
          artifact={atsArtifact({
            payload: {
              result: {
                atsScorecard: {
                  before: fullScore({ overallScore: 23, grade: 'F' }),
                  after: fullScore({ overallScore: 72, grade: 'B' }),
                  change: 49,
                },
              },
            },
          })}
          open={true}
        />,
      );
      const body = screen.getByTestId('artifact-body-ats');
      expect(body.textContent).toContain('49');
      expect(body.textContent).toContain('72');
    });

    it('accepts score field alias when overallScore is missing', () => {
      render(
        <AtsComparisonBody
          artifact={atsArtifact({
            before: {
              score: 30,
              grade: 'D',
              matchedKeywords: [],
              missingKeywords: [],
            },
            after: {
              score: 55,
              grade: 'C',
              matchedKeywords: [],
              missingKeywords: [],
            },
            delta: 25,
          })}
          open={true}
        />,
      );
      const body = screen.getByTestId('artifact-body-ats');
      expect(body.textContent).toContain('55');
      expect(body.textContent).toContain('25');
    });
  });

  describe('numeric edge cases', () => {
    it('handles zero before score (avoids division by zero in percent)', () => {
      render(
        <AtsComparisonBody
          artifact={atsArtifact({
            before: fullScore({ overallScore: 0, grade: 'F' }),
            after: fullScore({ overallScore: 10 }),
            improvement: 10,
          })}
          open={true}
        />,
      );
      const body = screen.getByTestId('artifact-body-ats');
      // rawPercent = 10 / 0 * 100 = Infinity -> guarded to 0 -> no percent row
      expect(body.textContent).toContain('0');
      expect(body.textContent).not.toContain('NaN');
      expect(body.textContent).not.toContain('Infinity');
    });

    it('handles negative improvement (user regressed)', () => {
      render(
        <AtsComparisonBody
          artifact={atsArtifact({
            before: fullScore({ overallScore: 80 }),
            after: fullScore({ overallScore: 50 }),
            improvement: -30,
          })}
          open={true}
        />,
      );
      const body = screen.getByTestId('artifact-body-ats');
      // Negative improvement renders as "-30" not "+-30"
      expect(body.textContent).toContain('-30');
      expect(body.textContent).not.toContain('+-');
    });

    it('unknown grade falls through to default zinc color without crashing', () => {
      render(
        <AtsComparisonBody
          artifact={atsArtifact({
            before: fullScore({ grade: 'Q' }),
            after: fullScore({ grade: 'Z' }),
          })}
          open={true}
        />,
      );
      expect(screen.getByTestId('artifact-body-ats')).toBeTruthy();
    });

    it('handles missing breakdown without crashing', () => {
      render(
        <AtsComparisonBody
          artifact={atsArtifact({
            before: fullScore(),
            after: fullScore(),
          })}
          open={true}
        />,
      );
      const body = screen.getByTestId('artifact-body-ats');
      // No breakdown rows should render; renderer doesn't crash
      expect(body.textContent).not.toContain('Keyword match');
    });

    it('renders breakdown only when both before and after have it', () => {
      render(
        <AtsComparisonBody
          artifact={atsArtifact({
            before: {
              ...fullScore(),
              breakdown: {
                keywordMatch: 10,
                experienceRelevance: 20,
                skillsCoverage: 30,
                educationFit: 40,
                formatQuality: 50,
              },
            },
            after: {
              ...fullScore(),
              breakdown: {
                keywordMatch: 90,
                experienceRelevance: 80,
                skillsCoverage: 70,
                educationFit: 60,
                formatQuality: 50,
              },
            },
          })}
          open={true}
        />,
      );
      const body = screen.getByTestId('artifact-body-ats');
      expect(body.textContent).toContain('Keyword match');
      expect(body.textContent).toContain('Format');
    });
  });

  describe('XSS / injection safety', () => {
    it('does not render inline HTML or script from reasoning field', () => {
      render(
        <AtsComparisonBody
          artifact={atsArtifact({
            before: fullScore(),
            after: {
              ...fullScore(),
              reasoning: '<script>window.HACKED = true</script><img src=x onerror="alert(1)">',
            },
          })}
          open={true}
        />,
      );
      expect((globalThis as { HACKED?: boolean }).HACKED).toBeUndefined();
      // Text is rendered as text, not HTML -- React escapes it by default.
      const body = screen.getByTestId('artifact-body-ats');
      expect(body.innerHTML).not.toContain('<script>');
      expect(body.querySelector('script')).toBeNull();
      expect(body.querySelector('img[onerror]')).toBeNull();
    });

    it('does not render inline HTML from suggestion text', () => {
      render(
        <AtsComparisonBody
          artifact={atsArtifact({
            before: fullScore(),
            after: {
              ...fullScore(),
              enrichedSuggestions: [
                {
                  text: '<img src=x onerror="alert(1)">',
                  priority: 'high',
                  targetSection: 'Summary',
                  estimatedScoreImpact: 10,
                },
              ],
            },
          })}
          open={true}
        />,
      );
      const body = screen.getByTestId('artifact-body-ats');
      expect(body.querySelector('img[onerror]')).toBeNull();
    });
  });

  describe('confidence distribution edge cases', () => {
    it('renders no distribution when confidence array is empty', () => {
      render(
        <AtsComparisonBody
          artifact={atsArtifact({
            before: fullScore(),
            after: { ...fullScore(), keywordConfidences: [] },
          })}
          open={true}
        />,
      );
      const body = screen.getByTestId('artifact-body-ats');
      expect(body.textContent).not.toContain('Match confidence');
    });

    it('buckets a mix of confidences correctly (strong/moderate/weak/missing)', () => {
      render(
        <AtsComparisonBody
          artifact={atsArtifact({
            before: fullScore(),
            after: {
              ...fullScore(),
              keywordConfidences: [
                { keyword: 'a', confidence: 0.95, priority: 'required' },
                { keyword: 'b', confidence: 0.65, priority: 'required' },
                { keyword: 'c', confidence: 0.4, priority: 'preferred' },
                { keyword: 'd', confidence: 0.1, priority: 'preferred' },
              ],
            },
          })}
          open={true}
        />,
      );
      const body = screen.getByTestId('artifact-body-ats');
      expect(body.textContent).toContain('Strong');
      expect(body.textContent).toContain('Moderate');
      expect(body.textContent).toContain('Weak');
      expect(body.textContent).toContain('Missing');
    });
  });

  describe('keyword extraction', () => {
    it('identifies added keywords via case-insensitive match', () => {
      render(
        <AtsComparisonBody
          artifact={atsArtifact({
            before: { ...fullScore(), missingKeywords: ['Python', 'GraphQL'] },
            after: {
              ...fullScore(),
              matchedKeywords: [{ keyword: 'python' }, { keyword: 'graphql' }],
            },
          })}
          open={true}
        />,
      );
      const body = screen.getByTestId('artifact-body-ats');
      expect(body.textContent).toContain('Added');
      expect(body.textContent).toContain('Python');
      expect(body.textContent).toContain('GraphQL');
    });

    it('huge missingKeywords list does not freeze render', () => {
      const huge = Array.from({ length: 500 }, (_, i) => `keyword-${i}`);
      render(
        <AtsComparisonBody
          artifact={atsArtifact({
            before: { ...fullScore(), missingKeywords: huge },
            after: { ...fullScore(), missingKeywords: huge },
          })}
          open={true}
        />,
      );
      // Should render without throwing; actual DOM assertion is cheap
      expect(screen.getByTestId('artifact-body-ats')).toBeTruthy();
    });
  });
});
