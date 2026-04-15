// SPDX-License-Identifier: MIT
/**
 * Unit tests for src/shared/i18n.ts
 *
 * Covers:
 *   - Happy path: chrome.i18n.getMessage is called and its result returned.
 *   - Substitutions are forwarded verbatim to chrome.i18n.getMessage.
 *   - Missing-chrome fallback returns the key as-is.
 *   - Empty-string-from-getMessage fallback returns the key as-is.
 *   - getLocale() returns the result of getUILanguage() when chrome is present.
 *   - getLocale() returns 'en' when chrome is absent.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type ChromeStub = {
  i18n: {
    getMessage: (key: string, subs?: readonly string[]) => string;
    getUILanguage: () => string;
  };
};

/** Install a fake chrome.i18n on globalThis, return teardown fn. */
function installChrome(stub: ChromeStub): () => void {
  const g = globalThis as unknown as { chrome?: ChromeStub };
  const prev = g.chrome;
  g.chrome = stub;
  return () => {
    if (prev === undefined) {
      delete g.chrome;
    } else {
      g.chrome = prev;
    }
  };
}

/** Remove chrome from globalThis entirely, return teardown fn. */
function removeChrome(): () => void {
  const g = globalThis as unknown as { chrome?: unknown };
  const prev = g.chrome;
  delete g.chrome;
  return () => {
    if (prev !== undefined) {
      g.chrome = prev;
    }
  };
}

// ---------------------------------------------------------------------------
// We re-import after each test so module-level state is fresh.
// Because vitest caches modules we use vi.resetModules() + dynamic import.
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('t()', () => {
  it('returns the message from chrome.i18n.getMessage', async () => {
    const getMessage = vi.fn((_key: string) => 'Mocked: ' + _key);
    const teardown = installChrome({
      i18n: { getMessage, getUILanguage: () => 'en' },
    });
    try {
      const { t } = await import('@/src/shared/i18n');
      const result = t('userMenu_logout');
      expect(result).toBe('Mocked: userMenu_logout');
      expect(getMessage).toHaveBeenCalledWith('userMenu_logout', undefined);
    } finally {
      teardown();
    }
  });

  it('forwards substitutions to chrome.i18n.getMessage', async () => {
    const getMessage = vi.fn((_key: string, _subs?: readonly string[]) => 'result');
    const teardown = installChrome({
      i18n: { getMessage, getUILanguage: () => 'en' },
    });
    try {
      const { t } = await import('@/src/shared/i18n');
      t('userMenu_creditsLabel', ['9723']);
      expect(getMessage).toHaveBeenCalledWith('userMenu_creditsLabel', ['9723']);
    } finally {
      teardown();
    }
  });

  it('returns the key when chrome is absent (non-extension runtime)', async () => {
    const teardown = removeChrome();
    try {
      const { t } = await import('@/src/shared/i18n');
      const result = t('userMenu_logout');
      expect(result).toBe('userMenu_logout');
    } finally {
      teardown();
    }
  });

  it('returns the key when chrome.i18n.getMessage returns empty string', async () => {
    const getMessage = vi.fn(() => '');
    const teardown = installChrome({
      i18n: { getMessage, getUILanguage: () => 'en' },
    });
    try {
      const { t } = await import('@/src/shared/i18n');
      const result = t('credits_loading');
      expect(result).toBe('credits_loading');
    } finally {
      teardown();
    }
  });
});

describe('getLocale()', () => {
  it('returns the UI language from chrome.i18n.getUILanguage', async () => {
    const teardown = installChrome({
      i18n: {
        getMessage: () => '',
        getUILanguage: () => 'fr',
      },
    });
    try {
      const { getLocale } = await import('@/src/shared/i18n');
      expect(getLocale()).toBe('fr');
    } finally {
      teardown();
    }
  });

  it("returns 'en' when chrome is absent", async () => {
    const teardown = removeChrome();
    try {
      const { getLocale } = await import('@/src/shared/i18n');
      expect(getLocale()).toBe('en');
    } finally {
      teardown();
    }
  });

  it("returns 'en' when getUILanguage returns empty string", async () => {
    const teardown = installChrome({
      i18n: {
        getMessage: () => '',
        getUILanguage: () => '',
      },
    });
    try {
      const { getLocale } = await import('@/src/shared/i18n');
      expect(getLocale()).toBe('en');
    } finally {
      teardown();
    }
  });
});
