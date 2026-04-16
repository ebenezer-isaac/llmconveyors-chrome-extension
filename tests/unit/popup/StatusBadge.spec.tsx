// SPDX-License-Identifier: MIT
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  StatusBadge,
  computeStatus,
  type StatusBadgeProps,
} from '@/entrypoints/popup/StatusBadge';
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

async function renderBadge(props: StatusBadgeProps): Promise<void> {
  await act(async () => {
    root = createRoot(container!);
    root.render(<StatusBadge {...props} />);
  });
}

function query(testId: string): HTMLElement | null {
  return container?.querySelector(`[data-testid="${testId}"]`) ?? null;
}

describe('computeStatus', () => {
  it('prefers the adapter match over the generic fallback', () => {
    const adapter: DetectedIntent = {
      kind: 'greenhouse',
      pageKind: 'job-posting',
      url: 'https://boards.greenhouse.io/acme/jobs/1',
      detectedAt: 1,
    };
    const status = computeStatus(
      adapter,
      { hasJd: true, method: 'jsonld' },
      'job-hunter',
      false,
    );
    expect(status.kind).toBe('detected');
    expect(status.vendor).toBe('Greenhouse');
    expect(status.pageKind).toBe('Job posting');
  });

  it('falls back to generic when the adapter says unknown', () => {
    const adapter: DetectedIntent = {
      kind: 'unknown',
      pageKind: 'job-posting',
      url: 'https://example.com/careers/1',
      detectedAt: 1,
    };
    const status = computeStatus(
      adapter,
      { hasJd: true, method: 'jsonld' },
      'job-hunter',
      false,
    );
    expect(status.kind).toBe('generic');
    expect(status.vendor).toBe('Generic');
    expect(status.pageKind).toBe('Job detected');
    expect(status.method).toBe('jsonld');
  });

  it('uses company-page wording for b2b-sales when generic matches', () => {
    const status = computeStatus(
      null,
      { hasJd: true, method: 'readability' },
      'b2b-sales',
      false,
    );
    expect(status.kind).toBe('generic');
    expect(status.pageKind).toBe('Company page detected');
  });

  it('shows the b2b empty label when nothing is detected', () => {
    const status = computeStatus(
      null,
      { hasJd: false, method: null },
      'b2b-sales',
      false,
    );
    expect(status.kind).toBe('none');
    expect(status.pageKind).toBe('No company page detected');
  });

  it('shows loading when loading is true and nothing has resolved', () => {
    const status = computeStatus(
      null,
      { hasJd: false, method: null },
      'job-hunter',
      true,
    );
    expect(status.kind).toBe('loading');
  });

  it('collapses unknown+no-generic to none for job-hunter', () => {
    const status = computeStatus(
      null,
      { hasJd: false, method: null },
      'job-hunter',
      false,
    );
    expect(status.kind).toBe('none');
    expect(status.pageKind).toBe('No JD detected');
  });
});

describe('StatusBadge rendering', () => {
  it('renders the adapter-detected state with vendor and page-kind pills', async () => {
    const adapter: DetectedIntent = {
      kind: 'lever',
      pageKind: 'application-form',
      url: 'https://jobs.lever.co/acme/1/apply',
      detectedAt: 1,
    };
    await renderBadge({
      adapterIntent: adapter,
      genericJd: { hasJd: false, method: null },
      agentId: 'job-hunter',
      loading: false,
    });
    const badge = query('intent-badge');
    expect(badge?.getAttribute('data-state')).toBe('detected');
    expect(badge?.getAttribute('data-vendor')).toBe('lever');
    expect(query('intent-vendor')?.textContent).toMatch(/Lever/i);
    expect(query('intent-page-kind')?.textContent).toMatch(/Application form/i);
  });

  it('renders the generic match with Generic vendor (method hidden from UI)', async () => {
    await renderBadge({
      adapterIntent: null,
      genericJd: { hasJd: true, method: 'jsonld' },
      agentId: 'job-hunter',
      loading: false,
    });
    const badge = query('intent-badge');
    expect(badge?.getAttribute('data-state')).toBe('detected');
    expect(badge?.getAttribute('data-vendor')).toBe('generic');
    expect(badge?.getAttribute('data-method')).toBe('jsonld');
    expect(query('intent-vendor')?.textContent).toMatch(/Generic/i);
    expect(query('intent-page-kind')?.textContent).toMatch(/^Job detected$/i);
    expect(query('intent-page-kind')?.textContent).not.toMatch(/jsonld/i);
  });

  it('swaps wording for b2b-sales when the generic scan matches', async () => {
    await renderBadge({
      adapterIntent: null,
      genericJd: { hasJd: true, method: 'readability' },
      agentId: 'b2b-sales',
      loading: false,
    });
    expect(query('intent-page-kind')?.textContent).toMatch(
      /^Company page detected$/i,
    );
    expect(query('intent-page-kind')?.textContent).not.toMatch(/readability/i);
  });

  it('shows the "No JD detected" dashed badge when nothing matches', async () => {
    await renderBadge({
      adapterIntent: null,
      genericJd: { hasJd: false, method: null },
      agentId: 'job-hunter',
      loading: false,
    });
    const badge = query('intent-badge');
    expect(badge?.getAttribute('data-state')).toBe('none');
    expect(badge?.textContent).toMatch(/No JD detected/i);
  });

  it('shows the "No company page detected" copy for b2b-sales empty state', async () => {
    await renderBadge({
      adapterIntent: null,
      genericJd: { hasJd: false, method: null },
      agentId: 'b2b-sales',
      loading: false,
    });
    expect(query('intent-badge')?.textContent).toMatch(
      /No company page detected/i,
    );
  });

  it('renders the shimmer loader when loading is true and no signals arrived', async () => {
    await renderBadge({
      adapterIntent: null,
      genericJd: { hasJd: false, method: null },
      agentId: 'job-hunter',
      loading: true,
    });
    const badge = query('intent-badge');
    expect(badge?.getAttribute('data-state')).toBe('loading');
    expect(badge?.getAttribute('aria-busy')).toBe('true');
  });
});
