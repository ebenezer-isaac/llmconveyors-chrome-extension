// SPDX-License-Identifier: MIT
/**
 * Build-time/runtime environment configuration for the Chrome extension.
 *
 * Single source of truth:
 * - NEXT_PUBLIC_EXT_PROFILE selects a profile (`prod` or `local`).
 * - Individual NEXT_PUBLIC_* keys can override profile defaults when needed.
 */

type AuthRecoveryMode = 'coordinator' | 'legacy';
type ExtProfile = 'prod' | 'local' | 'staging';

interface ExtProfileDefaults {
  readonly webBaseUrl: string;
  readonly apiBaseUrl: string;
  readonly authCookieUrl: string;
  readonly authCookieDomain: string;
  readonly manifestHost: string;
}

interface ClientEnv {
  readonly profile: ExtProfile;
  readonly contactEmail: string;
  readonly rootDomain: string;
  readonly defaultLocale: string;
  readonly webBaseUrl: string;
  readonly apiBaseUrl: string;
  readonly authCookieUrl: string;
  readonly authCookieDomain: string;
  readonly authRecoveryMode: AuthRecoveryMode;
  readonly manifestHost: string;
}

const PROFILE_DEFAULTS: Record<ExtProfile, ExtProfileDefaults> = {
  local: {
    webBaseUrl: 'http://localhost:3000',
    apiBaseUrl: 'http://localhost:4000',
    authCookieUrl: 'http://localhost:3000',
    authCookieDomain: 'localhost',
    manifestHost: 'localhost',
  },
  prod: {
    webBaseUrl: 'https://llmconveyors.com',
    apiBaseUrl: 'https://api.llmconveyors.com',
    authCookieUrl: 'https://llmconveyors.com',
    authCookieDomain: 'llmconveyors.com',
    manifestHost: 'llmconveyors.com',
  },
  staging: {
    webBaseUrl: 'https://staging.llmconveyors.com',
    apiBaseUrl: 'https://staging.llmconveyors.com/api',
    authCookieUrl: 'https://staging.llmconveyors.com',
    authCookieDomain: 'staging.llmconveyors.com',
    manifestHost: 'staging.llmconveyors.com',
  },
};

function readImportMetaEnv(key: string): string | undefined {
  try {
    const env = (import.meta as ImportMeta & { env?: Record<string, unknown> }).env;
    const value = env?.[key];
    return typeof value === 'string' ? value : undefined;
  } catch {
    return undefined;
  }
}

function readProcessEnv(key: string): string | undefined {
  if (typeof process === 'undefined') return undefined;
  const value = process.env?.[key];
  return typeof value === 'string' ? value : undefined;
}

function readRawEnv(key: string): string | undefined {
  const fromProcess = readProcessEnv(key);
  if (typeof fromProcess === 'string' && fromProcess.trim().length > 0) {
    return fromProcess.trim();
  }
  const fromImportMeta = readImportMetaEnv(key);
  if (typeof fromImportMeta === 'string' && fromImportMeta.trim().length > 0) {
    return fromImportMeta.trim();
  }
  return undefined;
}

function readEnv(key: string, fallback: string): string {
  return readRawEnv(key) ?? fallback;
}

function normalizeHostLikeInput(raw: string): string {
  const trimmed = raw.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  if (/^localhost(?::\d+)?(?:\/.*)?$/i.test(trimmed)) {
    return `http://${trimmed}`;
  }
  return `https://${trimmed}`;
}

function readUrlEnv(key: string, fallback: string): string {
  const raw = readRawEnv(key);
  if (raw === undefined) return fallback;
  try {
    const parsed = new URL(normalizeHostLikeInput(raw));
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return fallback;
    }
    parsed.hash = '';
    parsed.search = '';
    const path = parsed.pathname.replace(/\/$/, '');
    const normalizedPath = path === '' ? '/' : path;
    return `${parsed.origin}${normalizedPath === '/' ? '' : normalizedPath}`;
  } catch {
    return fallback;
  }
}

function readAuthCookieDomain(webBaseUrl: string, fallbackRootDomain: string): string {
  const fromEnv = readRawEnv('NEXT_PUBLIC_EXT_AUTH_COOKIE_DOMAIN');
  if (fromEnv !== undefined) {
    return fromEnv.replace(/^\.+/, '').toLowerCase();
  }
  try {
    const host = new URL(webBaseUrl).hostname;
    if (host.length > 0) return host.toLowerCase();
  } catch {
    // Fallback used below.
  }
  return fallbackRootDomain.replace(/^\.+/, '').toLowerCase();
}

function readManifestHost(webBaseUrl: string, fallback: string): string {
  const fromEnv = readRawEnv('NEXT_PUBLIC_EXT_MANIFEST_HOST');
  if (fromEnv !== undefined) {
    return fromEnv.replace(/^\.+/, '').toLowerCase();
  }
  try {
    const host = new URL(webBaseUrl).hostname;
    if (host.length > 0) return host.toLowerCase();
  } catch {
    // Fallback used below.
  }
  return fallback.replace(/^\.+/, '').toLowerCase();
}

function readAuthRecoveryMode(): AuthRecoveryMode {
  const raw = readEnv('NEXT_PUBLIC_EXT_AUTH_RECOVERY_MODE', 'coordinator').toLowerCase();
  return raw === 'legacy' ? 'legacy' : 'coordinator';
}

function readProfile(): ExtProfile {
  const raw = readEnv('NEXT_PUBLIC_EXT_PROFILE', 'prod').toLowerCase();
  // Safety guard: local profile points auth + API calls to localhost.
  // Require an explicit opt-in to prevent accidental "localhost auth loop"
  // in day-to-day extension usage.
  if (raw === 'local') {
    const allowLocal = readEnv('NEXT_PUBLIC_EXT_ALLOW_LOCAL_PROFILE', 'false').toLowerCase() === 'true';
    return allowLocal ? 'local' : 'prod';
  }
  if (raw === 'staging') return 'staging';
  return 'prod';
}

const profile = readProfile();
const profileDefaults = PROFILE_DEFAULTS[profile];

const webBaseUrl = readUrlEnv('NEXT_PUBLIC_WEB_BASE_URL', profileDefaults.webBaseUrl);
const rootDomain = readEnv('NEXT_PUBLIC_ROOT_DOMAIN', profileDefaults.manifestHost);

const clientEnvValue: ClientEnv = {
  profile,
  contactEmail: readEnv('NEXT_PUBLIC_CONTACT_EMAIL', 'support@llmconveyors.com'),
  rootDomain,
  defaultLocale: readEnv('NEXT_PUBLIC_DEFAULT_LOCALE', 'en'),
  webBaseUrl,
  apiBaseUrl: readUrlEnv('NEXT_PUBLIC_API_BASE_URL', profileDefaults.apiBaseUrl),
  authCookieUrl: readUrlEnv('NEXT_PUBLIC_EXT_AUTH_COOKIE_URL', webBaseUrl),
  authCookieDomain: readAuthCookieDomain(webBaseUrl, rootDomain),
  authRecoveryMode: readAuthRecoveryMode(),
  manifestHost: readManifestHost(webBaseUrl, profileDefaults.manifestHost),
};

export const clientEnv = Object.freeze(clientEnvValue);

export const extConfig = Object.freeze({
  profile: clientEnv.profile,
  webBaseUrl: clientEnv.webBaseUrl,
  apiBaseUrl: clientEnv.apiBaseUrl,
  authCookieUrl: clientEnv.authCookieUrl,
  authCookieDomain: clientEnv.authCookieDomain,
  authRecoveryMode: clientEnv.authRecoveryMode,
  manifestHost: clientEnv.manifestHost,
});

export function getActiveProfile(): Readonly<typeof extConfig> {
  return extConfig;
}

// Compatibility aliases for legacy imports.
export const WEB_BASE_URL = extConfig.webBaseUrl;
export const API_BASE_URL = extConfig.apiBaseUrl;
export const AUTH_COOKIE_URL = extConfig.authCookieUrl;
export const AUTH_COOKIE_DOMAIN = extConfig.authCookieDomain;
export const MANIFEST_HOST = extConfig.manifestHost;
