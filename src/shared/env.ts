// SPDX-License-Identifier: MIT
/**
 * Build-time environment configuration for the Chrome extension.
 *
 * Mirrors the web app's `src/lib/env-client.ts` so the same env variable
 * names (NEXT_PUBLIC_*) and the same exported identifier (`clientEnv`) work
 * on both surfaces. WXT is configured to forward NEXT_PUBLIC_* into
 * import.meta.env at build time (see wxt.config.ts envPrefix).
 *
 * Each field falls back to a safe default so the extension always has a
 * valid configuration even when no .env file is present.
 *
 * Usage:
 *   import { clientEnv } from '@/src/shared/env';
 *   const url = clientEnv.apiBaseUrl;
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

export interface ClientEnv {
  readonly contactEmail: string;
  readonly rootDomain: string;
  readonly defaultLocale: string;
  readonly apiBaseUrl: string;
  readonly webBaseUrl: string;
}

export const clientEnv: ClientEnv = Object.freeze({
  contactEmail: readEnv('NEXT_PUBLIC_CONTACT_EMAIL', 'ebnezr.isaac@gmail.com'),
  rootDomain: readEnv('NEXT_PUBLIC_ROOT_DOMAIN', 'llmconveyors.com'),
  defaultLocale: readEnv('NEXT_PUBLIC_DEFAULT_LOCALE', 'en'),
  apiBaseUrl: readEnv('NEXT_PUBLIC_API_BASE_URL', 'https://api.llmconveyors.com'),
  webBaseUrl: readEnv('NEXT_PUBLIC_WEB_BASE_URL', 'https://llmconveyors.com'),
});
