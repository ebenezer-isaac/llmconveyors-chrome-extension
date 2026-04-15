// SPDX-License-Identifier: MIT
/**
 * Background message handlers. Every handler validates its payload via Zod
 * before business logic (D21) and uses injected dependencies (D20) so tests
 * can supply fakes without module-level mock state.
 *
 * The factory `createHandlers(deps)` returns the exhaustive HANDLERS record
 * keyed by BgHandledKey. `registerHandlers()` wires it to the runtime.
 */

import type { Logger } from '../log';
import type { StoredSession } from './schemas/auth.schema';
import type { DetectedIntent } from './schemas/intent.schema';
import type {
  AuthState,
  AuthSignInResponse,
  AuthSignOutResponse,
  IntentGetResponse,
  FillRequestResponse,
  KeywordsExtractResponse,
  HighlightStatus,
  GenerationStartResponse,
  GenerationCancelResponse,
  CreditsState,
  DetectedIntentPayload,
  KeywordsExtractRequest,
  GenerationStartRequest,
  GenerationCancelRequest,
  IntentGetRequest,
  FillRequest,
  AuthSignInRequest,
  AuthSignOutRequest,
  AuthStatusRequest,
  CreditsGetRequest,
  GenerationUpdateBroadcast,
  DetectedJobBroadcast,
  HighlightStatusRequest,
} from './protocol-types';
import type {
  MasterResumeGetOutcome,
  MasterResumePutOutcome,
  MasterResumeResponse,
  MasterResumeUpsert,
} from '../master-resume';
import { createMasterResumeHandlers } from '../master-resume';
import {
  AuthSignInRequestSchema,
  AuthSignOutRequestSchema,
  AuthStatusRequestSchema,
  AuthStateSchema,
  UNAUTHED,
  StoredSessionSchema,
} from './schemas/auth.schema';
import {
  DetectedIntentPayloadSchema,
  IntentGetRequestSchema,
  DetectedJobBroadcastSchema,
} from './schemas/intent.schema';
import { FillRequestSchema } from './schemas/fill.schema';
import {
  KeywordsExtractRequestSchema,
  ExtractSkillsBackendResponseSchema,
} from './schemas/keywords.schema';
import { HighlightStatusRequestSchema } from './schemas/highlight.schema';
import {
  GenerationStartRequestSchema,
  GenerationCancelRequestSchema,
  GenerationUpdateBroadcastSchema,
} from './schemas/generation.schema';
import { CreditsGetRequestSchema } from './schemas/credits.schema';
import { SessionExpiredError } from './errors';
import type { BgHandledKey, ProtocolMap } from './protocol';
import {
  newGenerationId,
  newSessionId,
} from '../types/brands';
import {
  AuthError,
  createSignInOrchestrator,
  DEFAULT_BRIDGE_URL,
  defaultParseAuthFragmentDeps,
  defaultWebAuthFlowDeps,
  launchWebAuthFlow as defaultLaunchWebAuthFlow,
} from '../auth';

/**
 * Storage facade: tests pass an in-memory stub, production wires
 * chrome.storage.local via the real adapters.
 */
export interface HandlerStorage {
  readSession: () => Promise<StoredSession | null>;
  writeSession: (s: StoredSession) => Promise<void>;
  clearSession: () => Promise<void>;
}

export interface HandlerTabState {
  getIntent: (tabId: number) => DetectedIntent | null;
  setIntent: (tabId: number, intent: DetectedIntent) => void;
  getHighlight: (tabId: number) => HighlightStatus;
  clearAll: () => void;
}

export interface HandlerBroadcast {
  sendRuntime: (message: { readonly key: string; readonly data: unknown }) => Promise<void>;
  sendToTab: (tabId: number, message: unknown) => Promise<unknown>;
}

export interface HandlerEndpoints {
  readonly authExchange: string;
  readonly authSignOut: string;
  readonly extractSkills: string;
  readonly usageSummary: string;
  readonly generationStart: string;
  readonly generationCancel: string;
}

export interface MasterResumeHandlerAdapters {
  readonly client: {
    get: () => Promise<MasterResumeGetOutcome>;
    put: (payload: MasterResumeUpsert) => Promise<MasterResumePutOutcome>;
  };
  readonly cache: {
    read: () => Promise<{ response: MasterResumeResponse; fetchedAt: number } | null>;
    readStale: () => Promise<{ response: MasterResumeResponse; fetchedAt: number } | null>;
    write: (r: MasterResumeResponse) => Promise<void>;
    clear: () => Promise<void>;
  };
}

export interface HandlerDeps {
  readonly logger: Logger;
  readonly fetch: typeof globalThis.fetch;
  readonly now: () => number;
  readonly storage: HandlerStorage;
  readonly tabState: HandlerTabState;
  readonly broadcast: HandlerBroadcast;
  readonly endpoints: HandlerEndpoints;
  readonly masterResume: MasterResumeHandlerAdapters;
}

/**
 * Handler signature: receives `{ data, sender }`, returns a Promise of the
 * ProtocolMap's return type for that key.
 */
export type HandlerFor<K extends BgHandledKey> = (msg: {
  readonly data: Parameters<ProtocolMap[K]>[0];
  readonly sender: chrome.runtime.MessageSender;
}) => Promise<ReturnType<ProtocolMap[K]>>;

export type Handlers = { readonly [K in BgHandledKey]: HandlerFor<K> };

async function safeSignedIn(storage: HandlerStorage): Promise<StoredSession | null> {
  try {
    return await storage.readSession();
  } catch {
    return null;
  }
}

export function createHandlers(deps: HandlerDeps): Handlers {
  const log = deps.logger;

  // ---- AUTH_SIGN_IN ----
  // Two execution paths:
  //   1. Legacy cookie-jar exchange (integration tests + server-assisted
  //      path): when `data.cookieJar` is a non-empty string, POST to
  //      endpoints.authExchange and persist the response.
  //   2. launchWebAuthFlow orchestrator (interactive popup sign-in): when
  //      no cookieJar is provided, drive the Chrome identity flow against
  //      the A4 bridge page, parse the chromiumapp.org fragment, extract
  //      userId from the JWT, and persist.
  const handleAuthSignIn: HandlerFor<'AUTH_SIGN_IN'> = async ({ data }) => {
    const parsed = AuthSignInRequestSchema.safeParse(data ?? {});
    if (!parsed.success) {
      return { ok: false, reason: 'invalid sign-in payload' };
    }
    const jar = parsed.data.cookieJar;
    if (typeof jar === 'string' && jar.length > 0) {
      return cookieJarExchange(jar);
    }
    return webAuthFlowSignIn();
  };

  async function cookieJarExchange(cookieJar: string): Promise<AuthSignInResponse> {
    try {
      const res = await deps.fetch(deps.endpoints.authExchange, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-llmc-ext-cookie-jar': cookieJar,
        },
        body: JSON.stringify({ cookieJar }),
      });
      if (!res.ok) {
        return { ok: false, reason: `exchange failed: ${res.status}` };
      }
      let body: unknown;
      try {
        body = await res.json();
      } catch {
        return { ok: false, reason: 'exchange response not JSON' };
      }
      if (typeof body !== 'object' || body === null) {
        return { ok: false, reason: 'exchange response not an object' };
      }
      const obj = body as Record<string, unknown>;
      const accessToken = typeof obj.accessToken === 'string' ? obj.accessToken : '';
      const refreshToken = typeof obj.refreshToken === 'string' ? obj.refreshToken : '';
      const expiresAt =
        typeof obj.expiresAt === 'number' && Number.isFinite(obj.expiresAt) && obj.expiresAt > 0
          ? obj.expiresAt
          : 0;
      const userId = typeof obj.userId === 'string' ? obj.userId : '';
      const candidate: StoredSession = { accessToken, refreshToken, expiresAt, userId };
      const validated = StoredSessionSchema.safeParse(candidate);
      if (!validated.success) {
        return { ok: false, reason: 'exchange response shape invalid' };
      }
      await deps.storage.writeSession(validated.data);
      const nextState: AuthState = { signedIn: true, userId: validated.data.userId };
      await deps.broadcast.sendRuntime({ key: 'AUTH_STATE_CHANGED', data: nextState });
      return { ok: true, userId: validated.data.userId };
    } catch (err) {
      log.error('AUTH_SIGN_IN: cookie-jar exchange failed', err);
      return { ok: false, reason: 'network error' };
    }
  }

  async function webAuthFlowSignIn(): Promise<AuthSignInResponse> {
    const orchestrator = createSignInOrchestrator({
      webAuthFlow: defaultWebAuthFlowDeps,
      storage: {
        writeSession: deps.storage.writeSession,
        readSession: deps.storage.readSession,
      },
      broadcast: {
        sendRuntime: deps.broadcast.sendRuntime,
      },
      parseDeps: defaultParseAuthFragmentDeps,
      logger: log,
      now: deps.now,
      bridgeUrl: DEFAULT_BRIDGE_URL,
      launch: defaultLaunchWebAuthFlow,
    });
    try {
      const state = await orchestrator();
      if (!state.signedIn) {
        return { ok: false, reason: 'sign-in returned unauthenticated state' };
      }
      return { ok: true, userId: state.userId };
    } catch (err) {
      if (err instanceof AuthError) {
        log.warn('AUTH_SIGN_IN: web-auth-flow failed', {
          errName: err.name,
          errMessage: err.message,
        });
        return { ok: false, reason: `${err.name}: ${err.message}` };
      }
      log.error('AUTH_SIGN_IN: web-auth-flow unexpected', err);
      return { ok: false, reason: 'unexpected error during sign-in' };
    }
  }

  // ---- AUTH_SIGN_OUT ----
  const handleAuthSignOut: HandlerFor<'AUTH_SIGN_OUT'> = async ({ data }) => {
    const parsed = AuthSignOutRequestSchema.safeParse(data ?? {});
    if (!parsed.success) {
      log.warn('AUTH_SIGN_OUT: invalid payload shape, proceeding with clear');
    }
    // Best-effort remote call; local clear runs regardless.
    try {
      await deps.fetch(deps.endpoints.authSignOut, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
    } catch (err) {
      log.warn('AUTH_SIGN_OUT: remote call failed, continuing with local clear', {
        error: String(err),
      });
    }
    try {
      await deps.storage.clearSession();
    } catch (err) {
      log.error('AUTH_SIGN_OUT: clearSession failed', err);
    }
    deps.tabState.clearAll();
    const nextState: AuthState = { signedIn: false };
    await deps.broadcast.sendRuntime({ key: 'AUTH_STATE_CHANGED', data: nextState });
    return { ok: true };
  };

  // ---- AUTH_STATUS ----
  const handleAuthStatus: HandlerFor<'AUTH_STATUS'> = async ({ data }) => {
    const parsed = AuthStatusRequestSchema.safeParse(data ?? {});
    if (!parsed.success) {
      log.warn('AUTH_STATUS: ignoring invalid request shape');
    }
    const session = await safeSignedIn(deps.storage);
    if (session === null) return UNAUTHED;
    return { signedIn: true, userId: session.userId };
  };

  // ---- AUTH_STATE_CHANGED (broadcast-only, inert) ----
  const handleAuthStateChanged: HandlerFor<'AUTH_STATE_CHANGED'> = async ({ data }) => {
    const parsed = AuthStateSchema.safeParse(data);
    if (!parsed.success) {
      log.warn('AUTH_STATE_CHANGED: invalid payload', {
        issues: parsed.error.issues.length,
      });
    }
    return undefined;
  };

  // ---- INTENT_DETECTED ----
  const handleIntentDetected: HandlerFor<'INTENT_DETECTED'> = async ({ data, sender }) => {
    const parsed = DetectedIntentPayloadSchema.safeParse(data);
    if (!parsed.success) {
      log.warn('INTENT_DETECTED: invalid payload', { issues: parsed.error.issues.length });
      return undefined;
    }
    let tabId: number = parsed.data.tabId;
    if (tabId === -1) {
      const senderTabId = sender.tab?.id;
      if (typeof senderTabId !== 'number') {
        log.warn('INTENT_DETECTED: -1 sentinel but sender.tab.id absent');
        return undefined;
      }
      tabId = senderTabId;
    }
    const intent: DetectedIntent = {
      kind: parsed.data.kind,
      pageKind: parsed.data.pageKind,
      url: parsed.data.url,
      jobTitle: parsed.data.jobTitle,
      company: parsed.data.company,
      detectedAt: parsed.data.detectedAt,
    };
    deps.tabState.setIntent(tabId, intent);
    return undefined;
  };

  // ---- INTENT_GET ----
  const handleIntentGet: HandlerFor<'INTENT_GET'> = async ({ data }) => {
    const parsed = IntentGetRequestSchema.safeParse(data);
    if (!parsed.success) return null;
    return deps.tabState.getIntent(parsed.data.tabId);
  };

  // ---- FILL_REQUEST (forwarder) ----
  // Post-101: profile-missing is no longer enforced here. The content-script
  // autofill-controller pulls the master-resume from the backend and returns
  // aborted 'profile-missing' if the resume is absent.
  const handleFillRequest: HandlerFor<'FILL_REQUEST'> = async ({ data }) => {
    const parsed = FillRequestSchema.safeParse(data);
    if (!parsed.success) {
      return { ok: false, aborted: true, abortReason: 'no-tab' };
    }
    try {
      const resp = await deps.broadcast.sendToTab(parsed.data.tabId, {
        key: 'FILL_REQUEST',
        data: { tabId: parsed.data.tabId, url: parsed.data.url },
      });
      if (!resp || typeof resp !== 'object') {
        return { ok: false, aborted: true, abortReason: 'content-script-not-loaded' };
      }
      return resp as FillRequestResponse;
    } catch (err) {
      log.warn('FILL_REQUEST: forward failed', { error: String(err) });
      return { ok: false, aborted: true, abortReason: 'content-script-not-loaded' };
    }
  };

  // ---- KEYWORDS_EXTRACT ----
  const handleKeywordsExtract: HandlerFor<'KEYWORDS_EXTRACT'> = async ({ data }) => {
    const parsed = KeywordsExtractRequestSchema.safeParse(data);
    if (!parsed.success) {
      return { ok: false, reason: 'empty-text' };
    }
    const session = await safeSignedIn(deps.storage);
    if (session === null) {
      return { ok: false, reason: 'signed-out' };
    }
    const started = deps.now();
    let res: Response;
    try {
      res = await deps.fetch(deps.endpoints.extractSkills, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${session.accessToken}`,
        },
        body: JSON.stringify({
          text: parsed.data.text,
          options: { topK: parsed.data.topK ?? 40 },
        }),
      });
    } catch (err) {
      if (err instanceof SessionExpiredError) return { ok: false, reason: 'signed-out' };
      log.warn('KEYWORDS_EXTRACT: network', { error: String(err) });
      return { ok: false, reason: 'network-error' };
    }
    if (res.status === 401 || res.status === 403) return { ok: false, reason: 'signed-out' };
    if (res.status === 429) return { ok: false, reason: 'rate-limited' };
    if (!res.ok) return { ok: false, reason: 'api-error' };

    let body: unknown;
    try {
      body = await res.json();
    } catch {
      return { ok: false, reason: 'api-error' };
    }
    const envelope = ExtractSkillsBackendResponseSchema.safeParse(body);
    if (!envelope.success) {
      log.warn('KEYWORDS_EXTRACT: envelope drift', {
        issues: envelope.error.issues.length,
      });
      return { ok: false, reason: 'api-error' };
    }
    return {
      ok: true,
      keywords: envelope.data.data.keywords,
      tookMs: deps.now() - started,
    };
  };

  // ---- HIGHLIGHT_STATUS ----
  const handleHighlightStatus: HandlerFor<'HIGHLIGHT_STATUS'> = async ({ data }) => {
    const parsed = HighlightStatusRequestSchema.safeParse(data);
    if (!parsed.success) {
      return { on: false, keywordCount: 0, appliedAt: null };
    }
    return deps.tabState.getHighlight(parsed.data.tabId);
  };

  // ---- GENERATION_START (stub returns invalid-payload on shape miss; A11 impl) ----
  const handleGenerationStart: HandlerFor<'GENERATION_START'> = async ({ data }) => {
    const parsed = GenerationStartRequestSchema.safeParse(data);
    if (!parsed.success) {
      return { ok: false, reason: 'invalid payload' };
    }
    const session = await safeSignedIn(deps.storage);
    if (session === null) return { ok: false, reason: 'signed-out' };
    try {
      const res = await deps.fetch(deps.endpoints.generationStart, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${session.accessToken}`,
        },
        body: JSON.stringify({ agent: parsed.data.agent, payload: parsed.data.payload }),
      });
      if (!res.ok) {
        return { ok: false, reason: `generation start failed: ${res.status}` };
      }
      let body: unknown;
      try {
        body = await res.json();
      } catch {
        return { ok: false, reason: 'generation start response not JSON' };
      }
      const obj = (body ?? {}) as Record<string, unknown>;
      const gid = typeof obj.generationId === 'string' ? obj.generationId : newGenerationId();
      const sid = typeof obj.sessionId === 'string' ? obj.sessionId : newSessionId();
      return { ok: true, generationId: gid, sessionId: sid };
    } catch (err) {
      log.warn('GENERATION_START: network', { error: String(err) });
      return { ok: false, reason: 'network error' };
    }
  };

  // ---- GENERATION_UPDATE (broadcast-only, inert) ----
  const handleGenerationUpdate: HandlerFor<'GENERATION_UPDATE'> = async ({ data }) => {
    const parsed = GenerationUpdateBroadcastSchema.safeParse(data);
    if (!parsed.success) {
      log.warn('GENERATION_UPDATE: invalid broadcast', {
        issues: parsed.error.issues.length,
      });
    }
    return undefined;
  };

  // ---- GENERATION_CANCEL ----
  const handleGenerationCancel: HandlerFor<'GENERATION_CANCEL'> = async ({ data }) => {
    const parsed = GenerationCancelRequestSchema.safeParse(data);
    if (!parsed.success) {
      return { ok: false };
    }
    const session = await safeSignedIn(deps.storage);
    if (session === null) return { ok: false };
    try {
      const res = await deps.fetch(deps.endpoints.generationCancel, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${session.accessToken}`,
        },
        body: JSON.stringify({ generationId: parsed.data.generationId }),
      });
      return { ok: res.ok };
    } catch (err) {
      log.warn('GENERATION_CANCEL: network', { error: String(err) });
      return { ok: false };
    }
  };

  // ---- DETECTED_JOB_BROADCAST (inert fan-out via broadcast helper) ----
  const handleDetectedJobBroadcast: HandlerFor<'DETECTED_JOB_BROADCAST'> = async ({
    data,
  }) => {
    const parsed = DetectedJobBroadcastSchema.safeParse(data);
    if (!parsed.success) {
      log.warn('DETECTED_JOB_BROADCAST: invalid payload', {
        issues: parsed.error.issues.length,
      });
    }
    return undefined;
  };

  // ---- CREDITS_GET ----
  const handleCreditsGet: HandlerFor<'CREDITS_GET'> = async ({ data }) => {
    const parsed = CreditsGetRequestSchema.safeParse(data ?? {});
    if (!parsed.success) {
      log.warn('CREDITS_GET: invalid payload');
    }
    const fallback: CreditsState = { balance: 0, plan: 'unknown', resetAt: null };
    const session = await safeSignedIn(deps.storage);
    if (session === null) return fallback;
    try {
      const res = await deps.fetch(deps.endpoints.usageSummary, {
        method: 'GET',
        headers: { authorization: `Bearer ${session.accessToken}` },
      });
      if (!res.ok) return fallback;
      let body: unknown;
      try {
        body = await res.json();
      } catch {
        return fallback;
      }
      if (typeof body !== 'object' || body === null) return fallback;
      const obj = body as Record<string, unknown>;
      const dataObj = (obj.data as Record<string, unknown> | undefined) ?? obj;
      const balance = typeof dataObj.balance === 'number' ? dataObj.balance : 0;
      const plan = typeof dataObj.plan === 'string' ? dataObj.plan : 'unknown';
      const resetAt = typeof dataObj.resetAt === 'number' ? dataObj.resetAt : null;
      return { balance, plan, resetAt };
    } catch (err) {
      log.warn('CREDITS_GET: network', { error: String(err) });
      return fallback;
    }
  };

  const masterResumeHandlers = createMasterResumeHandlers({
    client: deps.masterResume.client,
    cache: deps.masterResume.cache,
    logger: log,
    broadcastUnauthenticated: async () => {
      try {
        await deps.storage.clearSession();
      } catch (err) {
        log.warn('master-resume: clearSession failed', { error: String(err) });
      }
      await deps.broadcast.sendRuntime({
        key: 'AUTH_STATE_CHANGED',
        data: { signedIn: false },
      });
    },
  });

  return Object.freeze({
    AUTH_SIGN_IN: handleAuthSignIn,
    AUTH_SIGN_OUT: handleAuthSignOut,
    AUTH_STATUS: handleAuthStatus,
    AUTH_STATE_CHANGED: handleAuthStateChanged,
    INTENT_DETECTED: handleIntentDetected,
    INTENT_GET: handleIntentGet,
    FILL_REQUEST: handleFillRequest,
    KEYWORDS_EXTRACT: handleKeywordsExtract,
    HIGHLIGHT_STATUS: handleHighlightStatus,
    GENERATION_START: handleGenerationStart,
    GENERATION_UPDATE: handleGenerationUpdate,
    GENERATION_CANCEL: handleGenerationCancel,
    DETECTED_JOB_BROADCAST: handleDetectedJobBroadcast,
    CREDITS_GET: handleCreditsGet,
    MASTER_RESUME_GET: masterResumeHandlers.MASTER_RESUME_GET,
    MASTER_RESUME_PUT: masterResumeHandlers.MASTER_RESUME_PUT,
  });
}

/**
 * Deep merge a patch onto a base. Scalars (strings, numbers, booleans) in the
 * patch REPLACE the base; arrays in the patch REPLACE the base; nested objects
 * are merged recursively. `undefined` in the patch is a no-op. `null` in the
 * patch writes `null`. __proto__ / constructor / prototype are skipped.
 */
export function deepMerge<T>(base: T, patch: unknown): T {
  if (patch === undefined) return base;
  if (patch === null) return null as unknown as T;
  if (typeof patch !== 'object') return patch as T;
  if (Array.isArray(patch)) return patch as unknown as T;
  // patch is a plain object from here on
  if (
    base === null ||
    base === undefined ||
    typeof base !== 'object' ||
    Array.isArray(base)
  ) {
    // Base cannot be merged into - patch wins wholesale but we still need to
    // strip forbidden keys from it.
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(patch as object)) {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
      result[key] = (patch as Record<string, unknown>)[key];
    }
    return result as T;
  }
  const result: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const key of Object.keys(patch as object)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
    const patchValue = (patch as Record<string, unknown>)[key];
    const baseValue = (base as Record<string, unknown>)[key];
    result[key] = deepMerge(baseValue, patchValue);
  }
  return result as T;
}

// Keep unused locals referenced so downstream imports are explicit contracts.
export type _AllHandlerInputs =
  | AuthSignInRequest
  | AuthSignOutRequest
  | AuthStatusRequest
  | AuthState
  | DetectedIntentPayload
  | IntentGetRequest
  | FillRequest
  | KeywordsExtractRequest
  | HighlightStatusRequest
  | GenerationStartRequest
  | GenerationCancelRequest
  | GenerationUpdateBroadcast
  | DetectedJobBroadcast
  | CreditsGetRequest;

export type _AllHandlerOutputs =
  | AuthSignInResponse
  | AuthSignOutResponse
  | AuthState
  | IntentGetResponse
  | FillRequestResponse
  | KeywordsExtractResponse
  | HighlightStatus
  | GenerationStartResponse
  | GenerationCancelResponse
  | CreditsState;
