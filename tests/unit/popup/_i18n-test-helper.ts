// SPDX-License-Identifier: MIT
/**
 * Test helper that installs a minimal `chrome.i18n` stub backed by the real
 * `public/_locales/en/messages.json` catalog so popup component tests can
 * assert on the localised English strings emitted by the `t()` helper.
 *
 * Keeps the in-memory mock aligned with shipped messages -- if a message key
 * is renamed in the catalog the tests break the same way the shipped surface
 * would, catching drift.
 */

import enMessages from '@/public/_locales/en/messages.json';

type MessageEntry = {
  readonly message: string;
  readonly placeholders?: Readonly<
    Record<string, { readonly content: string }>
  >;
};

function getMessage(
  key: string,
  subs?: string | readonly string[],
): string {
  const catalog = enMessages as unknown as Readonly<
    Record<string, MessageEntry>
  >;
  const entry = catalog[key];
  if (entry === undefined) return '';
  const subsArr = Array.isArray(subs)
    ? subs
    : subs !== undefined
      ? [subs]
      : [];
  let out = entry.message;
  if (entry.placeholders !== undefined) {
    for (const [name, spec] of Object.entries(entry.placeholders)) {
      const idx = Number.parseInt(spec.content.replace('$', ''), 10) - 1;
      const value = Number.isFinite(idx) ? (subsArr[idx] ?? '') : '';
      out = out.replace(new RegExp(`\\$${name}\\$`, 'g'), value);
    }
  }
  out = out.replace(
    /\$(\d+)/g,
    (_, n: string) => subsArr[Number.parseInt(n, 10) - 1] ?? '',
  );
  return out;
}

export interface InstalledI18n {
  readonly getMessage: (
    key: string,
    subs?: string | readonly string[],
  ) => string;
  readonly getUILanguage: () => string;
}

/**
 * Ensure the global `chrome.i18n` object exists with a working getMessage +
 * getUILanguage implementation. If `chrome` is already present (e.g. set up
 * by a test suite for runtime messaging), this mutates only the `i18n` key.
 */
export function installI18n(): InstalledI18n {
  const i18n: InstalledI18n = Object.freeze({
    getMessage,
    getUILanguage: () => 'en',
  });
  const g = globalThis as unknown as { chrome?: { i18n?: InstalledI18n } };
  if (g.chrome === undefined) {
    (globalThis as unknown as { chrome: { i18n: InstalledI18n } }).chrome = {
      i18n,
    };
  } else {
    g.chrome.i18n = i18n;
  }
  return i18n;
}

/** Remove the installed i18n mock (useful in afterEach). */
export function uninstallI18n(): void {
  const g = globalThis as unknown as { chrome?: { i18n?: unknown } };
  if (g.chrome !== undefined) {
    delete g.chrome.i18n;
  }
}
