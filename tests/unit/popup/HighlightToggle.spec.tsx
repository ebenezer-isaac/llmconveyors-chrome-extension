// SPDX-License-Identifier: MIT
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HighlightToggle } from '@/entrypoints/popup/HighlightToggle';

type Listener = (msg: unknown) => void;

function installFakeChrome(
  sendMessage: (msg: unknown) => Promise<unknown>,
): void {
  const listeners: Listener[] = [];
  (globalThis as unknown as { chrome: unknown }).chrome = {
    runtime: {
      sendMessage,
      onMessage: {
        addListener: (fn: Listener) => listeners.push(fn),
        removeListener: (fn: Listener) => {
          const i = listeners.indexOf(fn);
          if (i !== -1) listeners.splice(i, 1);
        },
      },
    },
  };
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  delete (globalThis as unknown as { chrome?: unknown }).chrome;
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

async function mount(
  props: { tabId: number | null; disabled?: boolean; disabledReason?: string },
): Promise<void> {
  await act(async () => {
    root = createRoot(container!);
    root.render(<HighlightToggle {...props} />);
  });
}

function query(testId: string): HTMLElement | null {
  return container?.querySelector(`[data-testid="${testId}"]`) ?? null;
}

async function click(el: HTMLElement): Promise<void> {
  await act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('HighlightToggle', () => {
  it('is disabled and shows tooltip when disabled prop is true', async () => {
    installFakeChrome(async () => undefined);
    await mount({ tabId: 42, disabled: true, disabledReason: 'Sign in first' });
    const btn = query('highlight-button') as HTMLButtonElement | null;
    expect(btn).not.toBeNull();
    expect(btn?.disabled).toBe(true);
    expect(btn?.getAttribute('title')).toBe('Sign in first');
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
  });

  it('is disabled when tabId is null regardless of disabled prop', async () => {
    installFakeChrome(async () => undefined);
    await mount({ tabId: null });
    const btn = query('highlight-button') as HTMLButtonElement | null;
    expect(btn?.disabled).toBe(true);
  });

  it('sends HIGHLIGHT_APPLY on first click and flips to on state on ok', async () => {
    const sendMessage = vi.fn(async (msg: unknown) => {
      const env = msg as { key?: string };
      if (env.key === 'HIGHLIGHT_APPLY')
        return { ok: true, keywordCount: 5, rangeCount: 7, tookMs: 12 };
      return undefined;
    });
    installFakeChrome(sendMessage);
    await mount({ tabId: 42 });
    const btn = query('highlight-button')!;
    await click(btn);
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'HIGHLIGHT_APPLY', data: { tabId: 42 } }),
    );
    const updated = query('highlight-button') as HTMLButtonElement;
    expect(updated.getAttribute('data-on')).toBe('true');
    expect(updated.getAttribute('aria-pressed')).toBe('true');
    expect(updated.textContent).toMatch(/Clear highlights/);
  });

  it('sends HIGHLIGHT_CLEAR on second click and flips back to off', async () => {
    let step = 0;
    const sendMessage = vi.fn(async (msg: unknown) => {
      const env = msg as { key?: string };
      step++;
      if (env.key === 'HIGHLIGHT_APPLY')
        return { ok: true, keywordCount: 3, rangeCount: 4, tookMs: 5 };
      if (env.key === 'HIGHLIGHT_CLEAR') return { ok: true, cleared: true };
      return undefined;
    });
    installFakeChrome(sendMessage);
    await mount({ tabId: 99 });
    await click(query('highlight-button')!);
    await click(query('highlight-button')!);
    expect(step).toBe(2);
    const btn = query('highlight-button')!;
    expect(btn.getAttribute('data-on')).toBe('false');
  });

  it('shows a human-readable error for a not-a-job-posting rejection', async () => {
    installFakeChrome(async () => ({ ok: false, reason: 'not-a-job-posting' }));
    await mount({ tabId: 5 });
    await click(query('highlight-button')!);
    const err = query('highlight-error');
    expect(err).not.toBeNull();
    expect(err?.textContent).toMatch(/job posting/i);
  });

  it('shows a generic message for unknown reason strings', async () => {
    installFakeChrome(async () => ({ ok: false, reason: 'no-jd-on-page' }));
    await mount({ tabId: 5 });
    await click(query('highlight-button')!);
    const err = query('highlight-error');
    expect(err?.textContent).toMatch(/No job description/i);
  });

  it('renders an error when sendMessage throws', async () => {
    installFakeChrome(async () => {
      throw new Error('port closed');
    });
    await mount({ tabId: 1 });
    await click(query('highlight-button')!);
    const err = query('highlight-error');
    expect(err?.textContent).toMatch(/port closed/);
  });

  it('no-ops when runtime is unavailable', async () => {
    delete (globalThis as unknown as { chrome?: unknown }).chrome;
    await mount({ tabId: 1 });
    await click(query('highlight-button')!);
    const err = query('highlight-error');
    expect(err?.textContent).toMatch(/runtime/i);
  });
});
