// SPDX-License-Identifier: MIT
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AutofillHistory } from '@/entrypoints/sidepanel/AutofillHistory';
import type { AutofillHistoryEntry } from '@/entrypoints/sidepanel/useAutofillHistory';

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
  history: readonly AutofillHistoryEntry[],
  loading: boolean,
): Promise<void> {
  await act(async () => {
    root = createRoot(container!);
    root.render(<AutofillHistory history={history} loading={loading} />);
  });
}

function q(testId: string): HTMLElement | null {
  return container?.querySelector(`[data-testid="${testId}"]`) ?? null;
}

function qa(testId: string): HTMLElement[] {
  return Array.from(container?.querySelectorAll(`[data-testid="${testId}"]`) ?? []);
}

describe('AutofillHistory', () => {
  it('renders loading skeleton', async () => {
    await render([], true);
    expect(q('autofill-history')?.getAttribute('data-state')).toBe('loading');
  });

  it('renders empty-state when history is empty and not loading', async () => {
    await render([], false);
    expect(q('autofill-history')?.getAttribute('data-state')).toBe('empty');
  });

  it('renders one row per history entry with vendor + counts', async () => {
    const history: AutofillHistoryEntry[] = [
      {
        at: 1_700_000_000_000,
        atsKind: 'greenhouse',
        fieldsFilled: 6,
        fieldsSkipped: 1,
      },
      {
        at: 1_700_000_030_000,
        atsKind: 'workday',
        fieldsFilled: 3,
        fieldsSkipped: 0,
        stepLabel: 'myInformation',
      },
    ];
    await render(history, false);
    expect(q('autofill-history')?.getAttribute('data-state')).toBe('populated');
    expect(q('autofill-history')?.getAttribute('data-history-count')).toBe('2');
    expect(qa('autofill-history-row').length).toBe(2);
    const vendors = qa('autofill-history-vendor').map((el) => el.textContent);
    expect(vendors[0]).toBe('Greenhouse');
    expect(vendors[1]).toContain('Workday');
    expect(vendors[1]).toContain('myInformation');
    const filled = qa('autofill-history-filled').map((el) => el.textContent ?? '');
    expect(filled[0]).toContain('6');
    expect(filled[1]).toContain('3');
    const skipped = qa('autofill-history-skipped').map((el) => el.textContent ?? '');
    expect(skipped[0]).toContain('1');
    expect(skipped[1]).toContain('0');
  });
});
