// SPDX-License-Identifier: MIT
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CreditsDisplay } from '@/entrypoints/popup/CreditsDisplay';
import type { CreditsState } from '@/src/background/messaging/protocol';

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

async function render(
  credits: CreditsState | null,
  loading: boolean,
  error: string | null,
): Promise<void> {
  await act(async () => {
    root = createRoot(container!);
    root.render(
      <CreditsDisplay credits={credits} loading={loading} error={error} />,
    );
  });
}

function query(testId: string): HTMLElement | null {
  return container?.querySelector(`[data-testid="${testId}"]`) ?? null;
}

describe('CreditsDisplay', () => {
  it('renders the loading shimmer when loading and no credits yet', async () => {
    await render(null, true, null);
    const el = query('credits-remaining');
    expect(el).not.toBeNull();
    expect(el?.getAttribute('data-state')).toBe('loading');
    expect(el?.getAttribute('aria-busy')).toBe('true');
  });

  it('renders an error banner when error present and no credits', async () => {
    await render(null, false, 'boom');
    const el = query('credits-remaining');
    expect(el?.getAttribute('data-state')).toBe('error');
    expect(el?.textContent).toMatch(/unavailable/i);
  });

  it('renders "N credits" + tier label on free tier', async () => {
    const credits: CreditsState = { credits: 42, tier: 'free', byoKeyEnabled: false };
    await render(credits, false, null);
    const el = query('credits-remaining');
    expect(el?.getAttribute('data-state')).toBe('ready');
    expect(el?.getAttribute('data-balance')).toBe('42');
    expect(el?.getAttribute('data-tier')).toBe('free');
    expect(el?.textContent).toMatch(/42 credits/);
    expect(el?.textContent).toMatch(/Free tier/);
  });

  it('floors fractional balances and clamps negatives to zero', async () => {
    const credits: CreditsState = { credits: -5, tier: 'free', byoKeyEnabled: false };
    await render(credits, false, null);
    const el = query('credits-remaining');
    expect(el?.getAttribute('data-balance')).toBe('0');
    expect(el?.textContent).toMatch(/0 credits/);
  });

  it('keeps rendering ready state when loading resolves with cached credits', async () => {
    const credits: CreditsState = { credits: 10, tier: 'free', byoKeyEnabled: false };
    // loading=true + credits present should still show the ready state so
    // the UI never flashes back to a shimmer after the first fetch.
    await render(credits, true, null);
    const el = query('credits-remaining');
    expect(el?.getAttribute('data-state')).toBe('ready');
    expect(el?.textContent).toMatch(/10 credits/);
  });

  it('renders "BYO Key tier" label when tier is byo', async () => {
    const credits: CreditsState = { credits: 25, tier: 'byo', byoKeyEnabled: true };
    await render(credits, false, null);
    const el = query('credits-remaining');
    expect(el?.getAttribute('data-balance')).toBe('25');
    expect(el?.getAttribute('data-tier')).toBe('byo');
    expect(el?.textContent).toContain('25');
    expect(el?.textContent).toMatch(/BYO Key tier/);
  });
});
