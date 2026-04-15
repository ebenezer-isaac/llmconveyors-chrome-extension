// SPDX-License-Identifier: MIT
/**
 * Build-time environment configuration for the Chrome extension.
 *
 * WXT exposes variables prefixed with WXT_PUBLIC_* via import.meta.env at
 * build time (Vite under the hood). Each field falls back to a safe default
 * so the extension always has a valid configuration even without a .env file.
 *
 * Usage:
 *   import { extensionEnv } from '@/src/shared/env';
 *   const url = extensionEnv.apiBaseUrl;
 */

function readEnv(key: string, fallback: string): string {
  try {
    const env = (import.meta as unknown as { env?: Record<string, unknown> }).env;
    const v = env?.[key];
    if (typeof v === 'string' && v.length > 0) return v;
  } catch {
    // ignore -- test environments may not expose import.meta.env
  }
  return fallback;
}

export interface ExtensionEnv {
  readonly contactEmail: string;
  readonly rootDomain: string;
  readonly defaultLocale: string;
  readonly apiBaseUrl: string;
  readonly webBaseUrl: string;
}

export const extensionEnv: ExtensionEnv = Object.freeze({
  contactEmail: readEnv('WXT_PUBLIC_CONTACT_EMAIL', 'ebnezr.isaac@gmail.com'),
  rootDomain: readEnv('WXT_PUBLIC_ROOT_DOMAIN', 'llmconveyors.com'),
  defaultLocale: readEnv('WXT_PUBLIC_DEFAULT_LOCALE', 'en'),
  apiBaseUrl: readEnv('WXT_PUBLIC_API_BASE_URL', 'https://api.llmconveyors.com'),
  webBaseUrl: readEnv('WXT_PUBLIC_WEB_BASE_URL', 'https://llmconveyors.com'),
});
