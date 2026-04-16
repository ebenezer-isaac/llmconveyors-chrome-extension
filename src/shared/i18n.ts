// SPDX-License-Identifier: MIT
/**
 * Typed wrapper around Chrome's native chrome.i18n API.
 *
 * All message keys are statically typed via MessageKey. If chrome.i18n is
 * unavailable (test or non-extension runtime) the key is returned as-is so
 * snapshot tests can assert on the key rather than crashing. A dev-mode
 * warning is issued via the logger in that case.
 *
 * Usage:
 *   import { t, getLocale } from '@/src/shared/i18n';
 *   t('userMenu_logout')            // "Log out"
 *   t('userMenu_creditsLabel', ['9723'])  // "9723 credits"
 *   getLocale()                     // "en"
 */

import { createLogger } from '@/src/background/log';

const logger = createLogger('i18n');

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Union of every key present in public/_locales/en/messages.json. */
export type MessageKey =
  | 'appName'
  | 'appDescription'
  | 'header_agentLabel'
  | 'header_signOut'
  | 'userMenu_resumeCv'
  | 'userMenu_settings'
  | 'userMenu_dashboard'
  | 'userMenu_logout'
  | 'userMenu_usage'
  | 'userMenu_creditsLabel'
  | 'userMenu_tierFree'
  | 'userMenu_tierByo'
  | 'userMenu_tierByoEnabled'
  | 'userMenu_topUpPrompt'
  | 'userMenu_topUpSubject'
  | 'userMenu_topUpBody'
  | 'credits_remaining'
  | 'credits_loading'
  | 'credits_unavailable'
  | 'footer_version'
  | 'sessionList_title'
  | 'sessionList_viewAll'
  | 'sessionList_empty'
  | 'sessionList_loading'
  | 'agentSwitcher_label'
  | 'signIn_buttonLabel'
  | 'sessionList_errorPrefix'
  | 'theme_label'
  | 'theme_light'
  | 'theme_dark'
  | 'theme_system';

// ---------------------------------------------------------------------------
// Internal chrome accessor (safe across test / non-extension runtimes)
// ---------------------------------------------------------------------------

interface ChromeI18n {
  getMessage(messageName: string, substitutions?: string | readonly string[]): string;
  getUILanguage(): string;
}

function getChromeI18n(): ChromeI18n | undefined {
  const g = globalThis as unknown as { chrome?: { i18n?: ChromeI18n } };
  return g.chrome?.i18n;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Return the localised string for the given key.
 *
 * @param key - A typed MessageKey from the extension's message catalog.
 * @param substitutions - Optional ordered substitution values for placeholders.
 * @returns The localised string, or the key itself when chrome.i18n is absent
 *          or the key is missing from the catalog.
 */
export function t(key: MessageKey, substitutions?: readonly string[]): string {
  const i18n = getChromeI18n();

  if (i18n === undefined) {
    logger.warn('chrome.i18n unavailable; returning key as-is', { key });
    return key;
  }

  const result = i18n.getMessage(
    key,
    substitutions as string[] | undefined,
  );

  if (result === '' || result === undefined) {
    // Chrome returns an empty string for missing keys.
    logger.warn('chrome.i18n.getMessage returned empty string for key', { key });
    return key;
  }

  return result;
}

/**
 * Return the current UI locale string (e.g. "en", "en-GB", "fr").
 * Falls back to "en" when chrome.i18n is unavailable.
 */
export function getLocale(): string {
  const i18n = getChromeI18n();
  if (i18n === undefined) {
    return 'en';
  }
  const locale = i18n.getUILanguage();
  return locale !== '' ? locale : 'en';
}
