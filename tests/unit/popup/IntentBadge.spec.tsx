// SPDX-License-Identifier: MIT
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { IntentBadge } from '@/entrypoints/popup/IntentBadge';
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

async function renderBadge(
  intent: DetectedIntent | null,
  loading = false,
): Promise<void> {
  await act(async () => {
    root = createRoot(container!);
    root.render(<IntentBadge intent={intent} loading={loading} />);
  });
}

function query(testId: string): HTMLElement | null {
  return container?.querySelector(`[data-testid="${testId}"]`) ?? null;
}

describe('IntentBadge', () => {
  it('renders the "No JD detected" state when intent is null', async () => {
    await renderBadge(null);
    const badge = query('intent-badge');
    expect(badge).not.toBeNull();
    expect(badge?.getAttribute('data-state')).toBe('none');
    expect(badge?.textContent).toMatch(/No JD detected/i);
  });

  it('renders the "No JD detected" state when intent.kind is unknown', async () => {
    const intent: DetectedIntent = {
      kind: 'unknown',
      pageKind: 'job-posting',
      url: 'https://example.com',
      detectedAt: 0,
    };
    await renderBadge(intent);
    const badge = query('intent-badge');
    expect(badge?.getAttribute('data-state')).toBe('none');
  });

  it('renders vendor and page kind for a detected greenhouse job posting', async () => {
    const intent: DetectedIntent = {
      kind: 'greenhouse',
      pageKind: 'job-posting',
      url: 'https://boards.greenhouse.io/acme/jobs/1',
      detectedAt: 1,
    };
    await renderBadge(intent);
    const badge = query('intent-badge');
    expect(badge).not.toBeNull();
    expect(badge?.getAttribute('data-state')).toBe('detected');
    expect(badge?.getAttribute('data-vendor')).toBe('greenhouse');
    expect(badge?.getAttribute('data-page-kind')).toBe('job-posting');
    expect(query('intent-vendor')?.textContent).toMatch(/Greenhouse/i);
    expect(query('intent-page-kind')?.textContent).toMatch(/Job posting/i);
  });

  it('renders vendor and page kind for a lever application form', async () => {
    const intent: DetectedIntent = {
      kind: 'lever',
      pageKind: 'application-form',
      url: 'https://jobs.lever.co/acme/1/apply',
      detectedAt: 2,
    };
    await renderBadge(intent);
    expect(query('intent-vendor')?.textContent).toMatch(/Lever/i);
    expect(query('intent-page-kind')?.textContent).toMatch(/Application form/i);
  });

  it('renders the workday vendor label with the short form', async () => {
    const intent: DetectedIntent = {
      kind: 'workday',
      pageKind: 'application-form',
      url: 'https://deloitte.wd1.myworkdayjobs.com/x/1',
      detectedAt: 3,
    };
    await renderBadge(intent);
    expect(query('intent-vendor')?.textContent).toMatch(/Workday/i);
  });

  it('renders the loading shimmer when loading is true and intent is null', async () => {
    await renderBadge(null, true);
    const badge = query('intent-badge');
    expect(badge?.getAttribute('data-state')).toBe('loading');
    expect(badge?.getAttribute('aria-busy')).toBe('true');
  });
});
