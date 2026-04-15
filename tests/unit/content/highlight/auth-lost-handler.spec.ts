// SPDX-License-Identifier: MIT
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { handleAuthLost } from '@/src/content/highlight/auth-lost-handler';
import {
  __resetHighlightStateForTest,
  getHighlightState,
  setHighlightState,
} from '@/src/content/highlight/state';
import {
  __resetJdCacheForTest,
  getJdCache,
  setJdCache,
} from '@/src/content/highlight/jd-cache';
import type { Logger } from '@/src/background/log';

function fakeLogger(): Logger {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

function makeDoc(bodyHtml: string): Document {
  const doc = document.implementation.createHTMLDocument('t');
  doc.body.innerHTML = bodyHtml;
  return doc;
}

describe('handleAuthLost', () => {
  beforeEach(() => {
    __resetHighlightStateForTest();
    __resetJdCacheForTest();
  });

  it('invokes stored cleanup and clears state + JD cache', () => {
    const cleanup: Mock<() => void> = vi.fn();
    setHighlightState({
      cleanup: cleanup as unknown as () => void,
      keywordCount: 1,
      rangeCount: 1,
      appliedAt: 1,
      url: 'https://x.test/',
    });
    setJdCache('https://x.test/', {
      text: 'hi',
      method: 'jsonld',
      cachedAt: 1,
    });
    const removeAll: Mock<(root: Element) => void> = vi.fn();
    handleAuthLost({
      logger: fakeLogger(),
      document: makeDoc(''),
      removeAllHighlights: removeAll as unknown as (root: Element) => void,
    });
    expect(cleanup).toHaveBeenCalled();
    expect(removeAll).toHaveBeenCalled();
    expect(getHighlightState().cleanup).toBeNull();
    expect(getJdCache('https://x.test/')).toBeNull();
  });

  it('tolerates cleanup throwing and still scrubs the DOM', () => {
    const cleanup: Mock<() => void> = vi.fn(() => {
      throw new Error('boom');
    });
    setHighlightState({
      cleanup: cleanup as unknown as () => void,
      keywordCount: 1,
      rangeCount: 1,
      appliedAt: 1,
      url: 'https://x.test/',
    });
    const removeAll: Mock<(root: Element) => void> = vi.fn();
    handleAuthLost({
      logger: fakeLogger(),
      document: makeDoc(''),
      removeAllHighlights: removeAll as unknown as (root: Element) => void,
    });
    expect(removeAll).toHaveBeenCalled();
  });

  it('tolerates removeAllHighlights throwing', () => {
    const removeAll: Mock<(root: Element) => void> = vi.fn(() => {
      throw new Error('dom');
    });
    const logger = fakeLogger();
    expect(() =>
      handleAuthLost({
        logger,
        document: makeDoc(''),
        removeAllHighlights: removeAll as unknown as (root: Element) => void,
      }),
    ).not.toThrow();
    expect(logger.warn).toHaveBeenCalled();
  });
});
