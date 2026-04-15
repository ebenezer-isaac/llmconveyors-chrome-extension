// SPDX-License-Identifier: MIT
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { JdSummary } from '@/entrypoints/sidepanel/JdSummary';
import type { DetectedIntent } from '@/src/background/messaging/protocol';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  container = null;
  root = null;
});

async function render(intent: DetectedIntent | null, loading: boolean): Promise<void> {
  await act(async () => {
    root = createRoot(container!);
    root.render(<JdSummary intent={intent} loading={loading} />);
  });
}

function q(testId: string): HTMLElement | null {
  return container?.querySelector(`[data-testid="${testId}"]`) ?? null;
}

describe('JdSummary', () => {
  it('renders shimmer skeleton while loading', async () => {
    await render(null, true);
    const el = q('jd-summary');
    expect(el).not.toBeNull();
    expect(el?.getAttribute('data-state')).toBe('loading');
    expect(el?.getAttribute('aria-busy')).toBe('true');
  });

  it('renders empty-state copy when intent is null', async () => {
    await render(null, false);
    const el = q('jd-summary');
    expect(el?.getAttribute('data-state')).toBe('none');
    expect(el?.textContent ?? '').toContain('No JD detected');
  });

  it('renders empty-state when intent kind is unknown', async () => {
    const intent: DetectedIntent = {
      kind: 'unknown',
      pageKind: 'job-posting',
      url: 'https://example.com',
      detectedAt: 1,
    };
    await render(intent, false);
    expect(q('jd-summary')?.getAttribute('data-state')).toBe('none');
  });

  it('renders vendor, kind, title, company, and url when intent is detected', async () => {
    const intent: DetectedIntent = {
      kind: 'greenhouse',
      pageKind: 'job-posting',
      url: 'https://boards.greenhouse.io/acme/jobs/1',
      jobTitle: 'Staff Software Engineer',
      company: 'Acme Co',
      detectedAt: 100,
    };
    await render(intent, false);
    const el = q('jd-summary');
    expect(el?.getAttribute('data-state')).toBe('detected');
    expect(el?.getAttribute('data-vendor')).toBe('greenhouse');
    expect(el?.getAttribute('data-page-kind')).toBe('job-posting');
    expect(q('jd-vendor')?.textContent).toBe('Greenhouse');
    expect(q('jd-page-kind')?.textContent).toBe('Job posting');
    expect(q('jd-title')?.textContent).toBe('Staff Software Engineer');
    expect(q('jd-company')?.textContent).toBe('Acme Co');
    const url = q('jd-url') as HTMLAnchorElement | null;
    expect(url?.getAttribute('href')).toBe(intent.url);
  });

  it('falls back to generic labels when jobTitle/company missing', async () => {
    const intent: DetectedIntent = {
      kind: 'lever',
      pageKind: 'application-form',
      url: 'https://jobs.lever.co/example/123',
      detectedAt: 0,
    };
    await render(intent, false);
    expect(q('jd-title')?.textContent).toBe('Job posting');
    expect(q('jd-company')?.textContent).toBe('Unknown company');
  });
});
