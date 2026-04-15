// SPDX-License-Identifier: MIT
/**
 * Runtime configuration for the background worker.
 *
 * API base URLs come from WXT via import.meta.env at build time. Tests can
 * stub via module mocking. Every URL lives here so downstream phases find
 * them in one place.
 */

function readEnv(key: string, fallback: string): string {
  try {
    const env = (import.meta as unknown as { env?: Record<string, unknown> }).env;
    const v = env?.[key];
    if (typeof v === 'string' && v.length > 0) return v;
  } catch {
    // ignore
  }
  return fallback;
}

export const API_BASE_URL: string = readEnv(
  'VITE_LLMC_API_BASE_URL',
  'https://api.llmconveyors.com',
);

export const AUTH_EXCHANGE_ENDPOINT: string = API_BASE_URL + '/api/v1/auth/extension-token-exchange';
export const AUTH_SIGN_OUT_ENDPOINT: string = API_BASE_URL + '/api/v1/auth/sign-out';
export const EXTRACT_SKILLS_ENDPOINT: string = API_BASE_URL + '/api/v1/ats/extract-skills';
export const USAGE_SUMMARY_ENDPOINT: string = API_BASE_URL + '/api/v1/settings/usage/summary';
export const GENERATION_START_ENDPOINT: string = API_BASE_URL + '/api/v1/agents/generate';
export const GENERATION_CANCEL_ENDPOINT: string = API_BASE_URL + '/api/v1/agents/cancel';
export const MASTER_RESUME_ENDPOINT: string = API_BASE_URL + '/api/v1/resume/master';

export const STORAGE_KEYS = Object.freeze({
  session: 'llmc.session.v1',
  profile: 'llmc.profile.v1',
  prefs: 'llmc.prefs.v1',
} as const);

export const LOG_SCOPES = Object.freeze({
  background: 'bg',
  refresh: 'bg.refresh',
  handlers: 'bg.handlers',
  storage: 'bg.storage',
  http: 'bg.http',
  session: 'bg.session',
  intent: 'bg.intent',
} as const);

/** Proactive refresh window: refresh if the token expires within this many ms. */
export const PROACTIVE_REFRESH_WINDOW_MS = 30_000;
