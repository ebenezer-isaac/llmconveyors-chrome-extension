// SPDX-License-Identifier: MIT
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { KeywordList } from '@/entrypoints/sidepanel/KeywordList';
import type { Keyword } from '@/entrypoints/sidepanel/useKeywords';

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
  keywords: readonly Keyword[],
  loading: boolean,
  onTermClick?: (kw: Keyword) => void,
): Promise<void> {
  await act(async () => {
    root = createRoot(container!);
    root.render(
      <KeywordList keywords={keywords} loading={loading} onTermClick={onTermClick} />,
    );
  });
}

function qa(testId: string): HTMLElement[] {
  return Array.from(container?.querySelectorAll(`[data-testid="${testId}"]`) ?? []);
}

function q(testId: string): HTMLElement | null {
  return container?.querySelector(`[data-testid="${testId}"]`) ?? null;
}

describe('KeywordList', () => {
  it('renders loading skeletons', async () => {
    await render([], true);
    expect(q('keyword-list')?.getAttribute('data-state')).toBe('loading');
  });

  it('renders empty-state when no keywords and not loading', async () => {
    await render([], false);
    expect(q('keyword-list')?.getAttribute('data-state')).toBe('empty');
  });

  it('renders one row per keyword with term, category, and score', async () => {
    const keywords: Keyword[] = [
      { term: 'TypeScript', category: 'tool', score: 1.0, canonicalForm: 'typescript' },
      { term: 'React', category: 'tool', score: 0.8, canonicalForm: 'react' },
      { term: 'distributed systems', category: 'domain', score: 0.5, canonicalForm: 'distributed-systems' },
    ];
    await render(keywords, false);
    expect(q('keyword-list')?.getAttribute('data-state')).toBe('populated');
    expect(q('keyword-list')?.getAttribute('data-keyword-count')).toBe('3');
    expect(qa('keyword-row').length).toBe(3);
    expect(q('keyword-count')?.textContent).toBe('3');
    const terms = qa('keyword-term').map((el) => el.textContent);
    expect(terms).toEqual(['TypeScript', 'React', 'distributed systems']);
    const scores = qa('keyword-score').map((el) => el.textContent);
    expect(scores).toEqual(['100', '80', '50']);
  });

  it('clamps non-finite or out-of-range scores in the display', async () => {
    const keywords: Keyword[] = [
      { term: 'A', category: 'tool', score: Number.NaN, canonicalForm: 'a' },
      { term: 'B', category: 'tool', score: -1, canonicalForm: 'b' },
      { term: 'C', category: 'tool', score: 5, canonicalForm: 'c' },
    ];
    await render(keywords, false);
    const scores = qa('keyword-score').map((el) => el.textContent);
    expect(scores).toEqual(['0', '0', '100']);
  });

  it('invokes onTermClick with the clicked keyword', async () => {
    const onClick = vi.fn();
    const keywords: Keyword[] = [
      { term: 'TypeScript', category: 'tool', score: 1.0, canonicalForm: 'typescript' },
    ];
    await render(keywords, false, onClick);
    const btn = container?.querySelector('button') as HTMLButtonElement | null;
    expect(btn).not.toBeNull();
    await act(async () => {
      btn!.click();
    });
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClick.mock.calls[0]?.[0]).toEqual(keywords[0]);
  });

  it('does not render buttons when onTermClick is not provided', async () => {
    const keywords: Keyword[] = [
      { term: 'TypeScript', category: 'tool', score: 1.0, canonicalForm: 'typescript' },
    ];
    await render(keywords, false);
    const btn = container?.querySelector('button');
    expect(btn).toBeNull();
  });
});
