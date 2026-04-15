// SPDX-License-Identifier: MIT
/**
 * Runtime configuration for the background worker.
 *
 * API base URLs come from WXT via import.meta.env at build time. Tests can
 * stub via module mocking. Every URL lives here so downstream phases find
 * them in one place.
 *
 * API_BASE_URL is sourced from clientEnv so all env reads are centralised
 * in src/shared/env.ts (mirrors the web app's clientEnv export).
 */

import { clientEnv } from '../shared/env';

export const API_BASE_URL: string = clientEnv.apiBaseUrl;

export const AUTH_EXCHANGE_ENDPOINT: string = API_BASE_URL + '/api/v1/auth/extension-token-exchange';
export const AUTH_SIGN_OUT_ENDPOINT: string = API_BASE_URL + '/api/v1/auth/sign-out';
export const EXTRACT_SKILLS_ENDPOINT: string = API_BASE_URL + '/api/v1/ats/extract-skills';
export const SETTINGS_PROFILE_ENDPOINT: string = API_BASE_URL + '/api/v1/settings/profile';
export const GENERATION_START_ENDPOINT: string = API_BASE_URL + '/api/v1/agents/generate';
export const GENERATION_CANCEL_ENDPOINT: string = API_BASE_URL + '/api/v1/agents/cancel';
export const MASTER_RESUME_ENDPOINT: string = API_BASE_URL + '/api/v1/resume/master';
export const SESSIONS_ENDPOINT: string = API_BASE_URL + '/api/v1/sessions';

/**
 * Builds an agent-scoped URL against the canonical backend. Agent-typed
 * endpoints (generate / interact / status) live under /api/v1/agents/:type/*
 * per the backend manifest.
 */
export function buildAgentGenerateUrl(agentType: string): string {
  return `${API_BASE_URL}/api/v1/agents/${encodeURIComponent(agentType)}/generate`;
}
export function buildAgentInteractUrl(agentType: string): string {
  return `${API_BASE_URL}/api/v1/agents/${encodeURIComponent(agentType)}/interact`;
}
export function buildSseStreamUrl(generationId: string): string {
  return `${API_BASE_URL}/api/v1/stream/generation/${encodeURIComponent(generationId)}`;
}

export const STORAGE_KEYS = Object.freeze({
  session: 'llmc.session.v1',
  profile: 'llmc.profile.v1',
  prefs: 'llmc.prefs.v1',
  sessionListCache: 'llmc.session-list-cache.v1',
} as const);

/** Session list cache TTL: 30 seconds. */
export const SESSION_LIST_CACHE_TTL_MS = 30_000;

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
