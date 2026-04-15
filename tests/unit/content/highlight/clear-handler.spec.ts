// SPDX-License-Identifier: MIT
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { createClearHandler } from '@/src/content/highlight/clear-handler';
import {
  __resetHighlightStateForTest,
  setHighlightState,
} from '@/src/content/highlight/state';
import type { Logger } from '@/src/background/log';

function fakeLogger(): Logger {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

function makeDoc(bodyHtml: string): Document {
  const doc = document.implementation.createHTMLDocument('t');
  doc.body.innerHTML = bodyHtml;
  return doc;
}

describe('createClearHandler', () => {
  beforeEach(() => {
    __resetHighlightStateForTest();
  });

  it('returns ok=true, cleared=true when a prior cleanup was stored', async () => {
    const cleanup: Mock<() => void> = vi.fn();
    setHighlightState({
      cleanup: cleanup as unknown as () => void,
      keywordCount: 3,
      rangeCount: 5,
      appliedAt: 1,
      url: 'https://x.test/',
    });
    const removeAll: Mock<(root: Element) => void> = vi.fn();
    const handler = createClearHandler({
      logger: fakeLogger(),
      document: makeDoc('<mark>x</mark>'),
      removeAllHighlights: removeAll as unknown as (root: Element) => void,
    });
    const res = await handler();
    expect(res).toEqual({ ok: true, cleared: true });
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(removeAll).toHaveBeenCalledTimes(1);
  });

  it('returns ok=true, cleared=false when no prior cleanup was stored', async () => {
    const removeAll: Mock<(root: Element) => void> = vi.fn();
    const handler = createClearHandler({
      logger: fakeLogger(),
      document: makeDoc(''),
      removeAllHighlights: removeAll as unknown as (root: Element) => void,
    });
    const res = await handler();
    expect(res).toEqual({ ok: true, cleared: false });
    expect(removeAll).toHaveBeenCalledTimes(1);
  });

  it('runs removeAllHighlights even when stored cleanup throws', async () => {
    const cleanup: Mock<() => void> = vi.fn(() => {
      throw new Error('cleanup boom');
    });
    setHighlightState({
      cleanup: cleanup as unknown as () => void,
      keywordCount: 1,
      rangeCount: 1,
      appliedAt: 1,
      url: 'https://x.test/',
    });
    const removeAll: Mock<(root: Element) => void> = vi.fn();
    const logger = fakeLogger();
    const handler = createClearHandler({
      logger,
      document: makeDoc(''),
      removeAllHighlights: removeAll as unknown as (root: Element) => void,
    });
    const res = await handler();
    expect(res).toEqual({ ok: true, cleared: true });
    expect(removeAll).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalled();
  });

  it('returns ok=false with a reason when removeAllHighlights throws', async () => {
    const removeAll: Mock<(root: Element) => void> = vi.fn(() => {
      throw new Error('dom broken');
    });
    const handler = createClearHandler({
      logger: fakeLogger(),
      document: makeDoc(''),
      removeAllHighlights: removeAll as unknown as (root: Element) => void,
    });
    const res = await handler();
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toMatch(/dom broken/);
    }
  });

  it('resets the highlight state on success', async () => {
    const cleanup: Mock<() => void> = vi.fn();
    setHighlightState({
      cleanup: cleanup as unknown as () => void,
      keywordCount: 3,
      rangeCount: 5,
      appliedAt: 1,
      url: 'https://x.test/',
    });
    const removeAll: Mock<(root: Element) => void> = vi.fn();
    const handler = createClearHandler({
      logger: fakeLogger(),
      document: makeDoc(''),
      removeAllHighlights: removeAll as unknown as (root: Element) => void,
    });
    await handler();
    const { getHighlightState } = await import('@/src/content/highlight/state');
    const state = getHighlightState();
    expect(state.cleanup).toBeNull();
    expect(state.keywordCount).toBe(0);
  });
});
