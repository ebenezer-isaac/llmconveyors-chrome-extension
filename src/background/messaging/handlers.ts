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
import type { FetchAuthed } from '../auth';
import type { SessionManager } from '../session/session-manager';
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
  ClientCreditsSnapshot,
  ClientProfileSnapshot,
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
  ProfileGetRequest,
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
import type {
  AgentId,
  AgentManifestOutcome,
  AgentPreferenceEntry,
} from '../agents';
import { createAgentHandlers } from '../agents';
import {
  createGenerationHandlers,
  type AgentClient,
} from '../generation';
import { createSessionHandlers } from '../sessions';
import type {
  SessionListClientOutcome,
  SessionHydrateClientOutcome,
} from '../sessions';
import type { CachedSessionList } from '../sessions';
import type { SessionBindingStore } from '../sessions';
import { canonicalizeUrl } from '../sessions';
import {
  SessionBindingPutRequestSchema,
  SessionBindingGetRequestSchema,
} from './schemas/session-binding.schema';
import type { SessionListItem } from './schemas/session-list.schema';
import { createGenericIntentHandler } from '../generic-intent';
import { createArtifactFetchBlobHandler } from '../sessions/artifact-fetch-handler';
import { API_BASE_URL } from '../config';
import type { GenericScanAgent, GenericScanResult } from '../generic-intent';
import {
  AuthSignInRequestSchema,
  AuthSignOutRequestSchema,
  AuthStatusRequestSchema,
  AuthCookieExchangeRequestSchema,
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
  HighlightApplyRequestSchema,
  HighlightClearRequestSchema,
} from './schemas/highlight.schema';
import {
  KeywordsExtractRequestSchema,
  ExtractSkillsBackendResponseSchema,
  ExtractJdBackendResponseSchema,
} from './schemas/keywords.schema';
import { HighlightStatusRequestSchema } from './schemas/highlight.schema';
import { GenerationUpdateBroadcastSchema } from './schemas/generation.schema';
import { CreditsGetRequestSchema } from './schemas/credits.schema';
import { ProfileGetRequestSchema } from './schemas/profile.schema';
import type { BgHandledKey, ProtocolMap } from './protocol';
import {
  createCookieExchange,
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
  readonly extractJd: string;
  readonly settingsProfile: string;
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

export interface AgentHandlerAdapters {
  readonly preference: {
    read: () => Promise<AgentPreferenceEntry>;
    write: (agentId: AgentId) => Promise<AgentPreferenceEntry>;
  };
  readonly manifestClient: {
    get: (agentId: AgentId) => Promise<AgentManifestOutcome>;
  };
}

export interface SessionHandlerAdapters {
  readonly client: {
    list: (q: {
      limit?: number;
      cursor?: string;
    }) => Promise<SessionListClientOutcome>;
  };
  readonly hydrateClient: {
    hydrate: (sessionId: string) => Promise<SessionHydrateClientOutcome>;
  };
  readonly cache: {
    read: () => Promise<CachedSessionList | null>;
    write: (entry: {
      items: readonly SessionListItem[];
      hasMore: boolean;
      nextCursor: string | null;
    }) => Promise<CachedSessionList>;
    clear: () => Promise<void>;
    isFresh: (entry: CachedSessionList) => boolean;
  };
  readonly bindings: SessionBindingStore;
}

export interface GenerationHandlerAdapters {
  readonly agentClient: AgentClient;
  readonly sse: {
    subscribe: (args: { generationId: string }) => Promise<
      | { readonly ok: true }
      | {
          readonly ok: false;
          readonly reason: 'signed-out' | 'network-error' | 'already-subscribed';
        }
    >;
    unsubscribe: (generationId: string) => void;
  };
  readonly cancelEndpoint: {
    cancel: (generationId: string) => Promise<{ ok: boolean }>;
  };
}

export interface GenericIntentHandlerAdapters {
  readonly scripting: {
    executeScript: (args: {
      target: { tabId: number };
      func: (agent: GenericScanAgent) => GenericScanResult;
      args: readonly [GenericScanAgent];
    }) => Promise<ReadonlyArray<{ result?: unknown }>>;
  };
}

export interface HandlerDeps {
  readonly logger: Logger;
  readonly fetch: typeof globalThis.fetch;
  readonly fetchAuthed: FetchAuthed;
  readonly sessionManager: SessionManager;
  readonly now: () => number;
  readonly storage: HandlerStorage;
  readonly tabState: HandlerTabState;
  readonly broadcast: HandlerBroadcast;
  readonly endpoints: HandlerEndpoints;
  readonly masterResume: MasterResumeHandlerAdapters;
  readonly agents: AgentHandlerAdapters;
  readonly sessions: SessionHandlerAdapters;
  readonly generation: GenerationHandlerAdapters;
  readonly genericIntent: GenericIntentHandlerAdapters;
  /** Web app base URL for tab-based sign-in fallback. */
  readonly webBaseUrl: string;
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

export function createHandlers(deps: HandlerDeps): Handlers {
  const log = deps.logger;

  // ---- AUTH_SIGN_IN ----
  // Three execution paths (tried in order):
  //   1. Cookie-jar exchange (E2E tests): when `data.cookieJar` is set.
  //   2. Cookie exchange: reads the web app's sAccessToken cookie directly
  //      via chrome.cookies -- works when user is already logged into the
  //      web app. No popup needed.
  //   3. Tab-based sign-in: opens the login page in a new browser tab so
  //      the user can authenticate on the web app. After login, the
  //      sAccessToken cookie is set and subsequent cookie exchange succeeds.
  //      Returns a special `{ ok: false, openedTab: true }` so the popup
  //      can show a "sign in on the website" message.
  const handleAuthSignIn: HandlerFor<'AUTH_SIGN_IN'> = async ({ data }) => {
    const parsed = AuthSignInRequestSchema.safeParse(data ?? {});
    if (!parsed.success) {
      return { ok: false, reason: 'invalid sign-in payload' };
    }
    const jar = parsed.data.cookieJar;
    if (typeof jar === 'string' && jar.length > 0) {
      return cookieJarExchange(jar);
    }

    // Try cookie exchange first (works if already logged into the web app)
    log.info('AUTH_SIGN_IN: attempting cookie exchange', {
      exchangeEndpoint: deps.endpoints.authExchange,
    });
    const exchange = createCookieExchange({
      logger: log,
      fetch: deps.fetch,
      exchangeEndpoint: deps.endpoints.authExchange,
      storage: { writeSession: deps.storage.writeSession },
      broadcast: { sendRuntime: deps.broadcast.sendRuntime },
    });
    const exchangeResult = await exchange();
    log.info('AUTH_SIGN_IN: cookie exchange result', {
      kind: exchangeResult.kind,
      reason: 'reason' in exchangeResult ? exchangeResult.reason : undefined,
    });
    if (exchangeResult.kind === 'ok') {
      return { ok: true, userId: exchangeResult.userId };
    }

    // Cookie exchange failed -- open a small popup window for login,
    // then poll for the sAccessToken cookie to appear.
    const loginUrl = `${deps.webBaseUrl}/login`;
    log.info('AUTH_SIGN_IN: opening login popup window', { loginUrl });

    let popupWindowId: number | undefined;
    try {
      const popup = await chrome.windows.create({
        url: loginUrl,
        type: 'popup',
        width: 460,
        height: 680,
        focused: true,
      });
      popupWindowId = popup?.id;
    } catch (err) {
      log.warn('AUTH_SIGN_IN: failed to open login popup', {
        error: err instanceof Error ? err.message : String(err),
      });
      return {
        ok: false,
        reason: 'Could not open sign-in window. Please try again.',
      };
    }

    // Poll for the cookie to appear (max ~2 minutes, every 2s)
    const MAX_POLLS = 60;
    const POLL_INTERVAL_MS = 2000;
    for (let i = 0; i < MAX_POLLS; i++) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

      // Check if the popup window was closed by the user
      if (typeof popupWindowId === 'number') {
        try {
          await chrome.windows.get(popupWindowId);
        } catch {
          log.info('AUTH_SIGN_IN: login popup closed by user');
          return {
            ok: false,
            reason: 'Sign-in window was closed. Click Sign In to try again.',
          };
        }
      }

      // Try cookie exchange
      const retryExchange = createCookieExchange({
        logger: log,
        fetch: deps.fetch,
        exchangeEndpoint: deps.endpoints.authExchange,
        storage: { writeSession: deps.storage.writeSession },
        broadcast: { sendRuntime: deps.broadcast.sendRuntime },
      });
      const retryResult = await retryExchange();
      if (retryResult.kind === 'ok') {
        log.info('AUTH_SIGN_IN: cookie exchange succeeded after login', {
          userId: retryResult.userId,
          pollCount: i + 1,
        });
        // Auto-close the login popup
        if (typeof popupWindowId === 'number') {
          try {
            await chrome.windows.remove(popupWindowId);
          } catch {
            // window may already be closed
          }
        }
        return { ok: true, userId: retryResult.userId };
      }
    }

    // Timed out
    log.warn('AUTH_SIGN_IN: cookie poll timed out');
    if (typeof popupWindowId === 'number') {
      try {
        await chrome.windows.remove(popupWindowId);
      } catch {
        // window may already be closed
      }
    }
    return {
      ok: false,
      reason: 'Sign-in timed out. Please try again.',
    };
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
    let session: StoredSession | null = null;
    try {
      session = await deps.storage.readSession();
    } catch {
      session = null;
    }
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

  // ---- AUTH_COOKIE_EXCHANGE ----
  // Reads the web app's sAccessToken cookie directly via chrome.cookies
  // and exchanges it for a header-mode session. Returns AuthState.
  const handleAuthCookieExchange: HandlerFor<'AUTH_COOKIE_EXCHANGE'> = async ({ data }) => {
    const parsed = AuthCookieExchangeRequestSchema.safeParse(data ?? {});
    if (!parsed.success) {
      log.warn('AUTH_COOKIE_EXCHANGE: invalid payload');
    }
    const exchange = createCookieExchange({
      logger: log,
      fetch: deps.fetch,
      exchangeEndpoint: deps.endpoints.authExchange,
      storage: { writeSession: deps.storage.writeSession },
      broadcast: { sendRuntime: deps.broadcast.sendRuntime },
    });
    const result = await exchange();
    if (result.kind === 'ok') {
      return { signedIn: true, userId: result.userId } as AuthState;
    }
    log.debug('AUTH_COOKIE_EXCHANGE: not successful', {
      kind: result.kind,
      reason: 'reason' in result ? result.reason : undefined,
    });
    return UNAUTHED;
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

  // ---- HIGHLIGHT_APPLY / HIGHLIGHT_CLEAR (forwarders) ----
  // Popup calls chrome.runtime.sendMessage({key:'HIGHLIGHT_APPLY',...})
  // because it can't target a specific tab directly. The bg takes the
  // runtime message and re-dispatches it to the content script on the
  // requested tab via chrome.tabs.sendMessage. Same pattern as
  // FILL_REQUEST above. Without this the popup message went to no
  // listener and the popup saw "no response".
  const handleHighlightApply: HandlerFor<'HIGHLIGHT_APPLY'> = async ({ data }) => {
    const parsed = HighlightApplyRequestSchema.safeParse(data);
    if (!parsed.success) {
      return { ok: false, reason: 'no-tab' };
    }
    const tabId = parsed.data.tabId;
    const message = { key: 'HIGHLIGHT_APPLY' as const, data: parsed.data };

    // First attempt: forward to the content script already loaded on ATS pages.
    try {
      const resp = await deps.broadcast.sendToTab(tabId, message);
      if (resp && typeof resp === 'object') {
        return resp as Awaited<ReturnType<HandlerFor<'HIGHLIGHT_APPLY'>>>;
      }
    } catch {
      // Content script not loaded on this tab (non-ATS page).
      // Inject programmatically via chrome.scripting (requires activeTab).
      log.info('HIGHLIGHT_APPLY: content script not loaded, injecting', { tabId });
    }

    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['content-scripts/ats.js'],
      });
      // Give the content script time to initialize and register listeners.
      await new Promise((r) => setTimeout(r, 500));
    } catch (err) {
      log.warn('HIGHLIGHT_APPLY: scripting.executeScript failed', {
        error: err instanceof Error ? err.message : String(err),
      });
      return { ok: false, reason: 'api-error' };
    }

    // Retry after injection.
    try {
      const resp = await deps.broadcast.sendToTab(tabId, message);
      if (!resp || typeof resp !== 'object') {
        return { ok: false, reason: 'api-error' };
      }
      return resp as Awaited<ReturnType<HandlerFor<'HIGHLIGHT_APPLY'>>>;
    } catch (err) {
      log.warn('HIGHLIGHT_APPLY: forward failed after injection', {
        error: String(err),
      });
      return { ok: false, reason: 'api-error' };
    }
  };

  const handleHighlightClear: HandlerFor<'HIGHLIGHT_CLEAR'> = async ({ data }) => {
    const parsed = HighlightClearRequestSchema.safeParse(data);
    if (!parsed.success) {
      return { ok: false, reason: 'no-tab' };
    }
    try {
      const resp = await deps.broadcast.sendToTab(parsed.data.tabId, {
        key: 'HIGHLIGHT_CLEAR',
        data: parsed.data,
      });
      if (!resp || typeof resp !== 'object') {
        return { ok: false, reason: 'api-error' };
      }
      return resp as Awaited<ReturnType<HandlerFor<'HIGHLIGHT_CLEAR'>>>;
    } catch (err) {
      log.warn('HIGHLIGHT_CLEAR: forward failed', { error: String(err) });
      return { ok: false, reason: 'api-error' };
    }
  };

  // ---- KEYWORDS_EXTRACT ----
  // Plan 106: when the caller includes `rawPageText` (the Chrome extension
  // primary path), route to POST /ats/extract-jd which runs the LLM
  // intersection pipeline. On any LLM failure, fall back to the legacy
  // /ats/extract-skills call with the cleaned JD text. This means the
  // extension's existing contract (a list of keywords with .term for DOM
  // highlighting) is preserved unchanged; the quality upgrade is transparent.
  const handleKeywordsExtract: HandlerFor<'KEYWORDS_EXTRACT'> = async ({ data }) => {
    const parsed = KeywordsExtractRequestSchema.safeParse(data);
    if (!parsed.success) {
      return { ok: false, reason: 'empty-text' };
    }

    const useLlmPath =
      typeof parsed.data.rawPageText === 'string' &&
      parsed.data.rawPageText.length >= 200;

    if (useLlmPath) {
      const started = deps.now();
      const result = await deps.fetchAuthed(deps.endpoints.extractJd, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          pageText: parsed.data.rawPageText,
          ...(parsed.data.url ? { url: parsed.data.url } : {}),
          ...(parsed.data.hostname ? { hostname: parsed.data.hostname } : {}),
        }),
      });
      if (result.kind === 'unauthenticated') {
        return { ok: false, reason: 'signed-out' };
      }
      if (result.kind === 'network-error') {
        log.warn('KEYWORDS_EXTRACT: extract-jd network error -- falling back', {
          error: result.error.message,
        });
        // fall through to legacy path below
      } else {
        const res = result.response;
        if (res.status === 429) return { ok: false, reason: 'rate-limited' };
        if (res.ok) {
          let body: unknown;
          try {
            body = await res.json();
          } catch {
            body = null;
          }
          const envelope = ExtractJdBackendResponseSchema.safeParse(body);
          if (envelope.success) {
            return {
              ok: true,
              keywords: envelope.data.data.skills,
              tookMs: deps.now() - started,
            };
          }
          log.warn('KEYWORDS_EXTRACT: extract-jd envelope drift -- falling back', {
            issues: envelope.error.issues.length,
          });
        } else {
          log.info(
            `KEYWORDS_EXTRACT: extract-jd returned ${res.status} -- falling back`,
          );
        }
      }
    }

    const started = deps.now();
    const result = await deps.fetchAuthed(deps.endpoints.extractSkills, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        text: parsed.data.text,
        options: { topK: parsed.data.topK ?? 40 },
      }),
    });
    if (result.kind === 'unauthenticated') {
      return { ok: false, reason: 'signed-out' };
    }
    if (result.kind === 'network-error') {
      log.warn('KEYWORDS_EXTRACT: network', { error: result.error.message });
      return { ok: false, reason: 'network-error' };
    }
    const res = result.response;
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

  // ---- Generation handlers (delegated to generation module) ----
  const generationHandlers = createGenerationHandlers({
    logger: log,
    agentClient: deps.generation.agentClient,
    sse: deps.generation.sse,
    broadcast: deps.broadcast.sendRuntime,
    cancelEndpoint: deps.generation.cancelEndpoint,
  });

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

  // ---- SESSION_SELECTED (broadcast-only; bg just no-ops so the
  // dispatcher does not reject the key. Destined for the sidepanel's
  // onMessage listener.)
  const handleSessionSelected: HandlerFor<'SESSION_SELECTED'> = async () => undefined;

  // ---- GENERATION_STARTED / GENERATION_COMPLETE (broadcast-only) ----
  const handleGenerationStarted: HandlerFor<'GENERATION_STARTED'> = async () => undefined;
  const handleGenerationComplete: HandlerFor<'GENERATION_COMPLETE'> = async () => {
    // Invalidate the session list cache so the next popup open refetches.
    try {
      await sessionHandlers.invalidateCache();
    } catch (err: unknown) {
      log.debug('GENERATION_COMPLETE: cache invalidate failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return undefined;
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

  // ---- CREDITS_GET / PROFILE_GET shared fetcher ----
  // Both handlers hit /api/v1/settings/profile. Backend returns the global
  // envelope `{ success, data: { credits, tier, byoKeyEnabled, email?,
  // displayName?, photoURL? } }`; we defensively also accept an un-enveloped
  // object so test fixtures stay compact. The profile identity fields are
  // optional so the extension keeps rendering gracefully until the backend
  // ships them.
  async function fetchSettingsProfile(): Promise<Record<string, unknown> | null> {
    const result = await deps.fetchAuthed(deps.endpoints.settingsProfile, {
      method: 'GET',
    });
    if (result.kind === 'unauthenticated') return null;
    if (result.kind === 'network-error') {
      log.warn('settings/profile fetch: network', {
        error: result.error.message,
      });
      return null;
    }
    const res = result.response;
    if (!res.ok) return null;
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      return null;
    }
    if (typeof body !== 'object' || body === null) return null;
    const obj = body as Record<string, unknown>;
    return (obj.data as Record<string, unknown> | undefined) ?? obj;
  }

  const handleCreditsGet: HandlerFor<'CREDITS_GET'> = async ({ data }) => {
    const parsed = CreditsGetRequestSchema.safeParse(data ?? {});
    if (!parsed.success) {
      log.warn('CREDITS_GET: invalid payload');
    }
    const fallback: ClientCreditsSnapshot = {
      credits: 0,
      tier: 'free',
      byoKeyEnabled: false,
    };
    const dataObj = await fetchSettingsProfile();
    if (dataObj === null) return fallback;
    const credits =
      typeof dataObj.credits === 'number' && Number.isFinite(dataObj.credits)
        ? Math.max(0, dataObj.credits)
        : 0;
    const tier: 'free' | 'byo' =
      dataObj.tier === 'byo' ? 'byo' : 'free';
    const byoKeyEnabled =
      typeof dataObj.byoKeyEnabled === 'boolean'
        ? dataObj.byoKeyEnabled
        : tier === 'byo';
    return { credits, tier, byoKeyEnabled };
  };

  // ---- PROFILE_GET ----
  // Shares the /api/v1/settings/profile endpoint with CREDITS_GET. Any of
  // `email` / `displayName` / `photoURL` that is not a non-empty string is
  // surfaced as `null` so the popup can fall back to userId-derived
  // initials without crashing.
  const handleProfileGet: HandlerFor<'PROFILE_GET'> = async ({ data }) => {
    const parsed = ProfileGetRequestSchema.safeParse(data ?? {});
    if (!parsed.success) {
      log.warn('PROFILE_GET: invalid payload');
    }
    const fallback: ClientProfileSnapshot = {
      email: null,
      displayName: null,
      photoURL: null,
    };
    const dataObj = await fetchSettingsProfile();
    if (dataObj === null) return fallback;
    const readNullableString = (raw: unknown): string | null =>
      typeof raw === 'string' && raw.length > 0 ? raw : null;
    return {
      email: readNullableString(dataObj.email),
      displayName: readNullableString(dataObj.displayName),
      photoURL: readNullableString(dataObj.photoURL),
    };
  };

  const agentHandlers = createAgentHandlers({
    preference: deps.agents.preference,
    manifestClient: deps.agents.manifestClient,
    logger: log,
  });

  const sessionHandlers = createSessionHandlers({
    client: deps.sessions.client,
    hydrateClient: deps.sessions.hydrateClient,
    cache: deps.sessions.cache,
    now: deps.now,
    logger: log,
  });

  // ---- SESSION_BINDING_PUT ----
  // Canonicalizes the url internally so callers (popup / sidepanel / content)
  // do not need a local canonicalizer. Rejects shape-invalid payloads and
  // returns `{ ok: false }` when the url cannot be canonicalized (chrome://,
  // file://, malformed).
  const handleSessionBindingPut: HandlerFor<'SESSION_BINDING_PUT'> = async ({ data }) => {
    const parsed = SessionBindingPutRequestSchema.safeParse(data);
    if (!parsed.success) {
      log.warn('SESSION_BINDING_PUT: invalid payload', {
        issues: parsed.error.issues.length,
      });
      return { ok: false };
    }
    const urlKey = canonicalizeUrl(parsed.data.url);
    if (urlKey === null) return { ok: false };
    const nowMs = deps.now();
    try {
      const existing = await deps.sessions.bindings.get(urlKey, parsed.data.agentId);
      const createdAt = existing?.createdAt ?? nowMs;
      await deps.sessions.bindings.put({
        sessionId: parsed.data.sessionId,
        generationId: parsed.data.generationId,
        agentId: parsed.data.agentId,
        urlKey,
        pageTitle:
          typeof parsed.data.pageTitle === 'string' && parsed.data.pageTitle.length > 0
            ? parsed.data.pageTitle
            : null,
        createdAt,
        updatedAt: nowMs,
      });
      return { ok: true };
    } catch (err: unknown) {
      log.warn('SESSION_BINDING_PUT: store failed', {
        error: err instanceof Error ? err.message : String(err),
      });
      return { ok: false };
    }
  };

  // ---- SESSION_BINDING_GET ----
  // Returns the stored binding or null. Canonicalization + TTL eviction run
  // inside the store. An uncanonicalizable url returns null (not an error):
  // the sidepanel treats this as "no binding for this tab".
  const handleSessionBindingGet: HandlerFor<'SESSION_BINDING_GET'> = async ({ data }) => {
    const parsed = SessionBindingGetRequestSchema.safeParse(data);
    if (!parsed.success) {
      log.warn('SESSION_BINDING_GET: invalid payload', {
        issues: parsed.error.issues.length,
      });
      return null;
    }
    const urlKey = canonicalizeUrl(parsed.data.url);
    if (urlKey === null) return null;
    try {
      return await deps.sessions.bindings.get(urlKey, parsed.data.agentId);
    } catch (err: unknown) {
      log.warn('SESSION_BINDING_GET: store failed', {
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  };

  const genericIntentHandler = createGenericIntentHandler({
    logger: log,
    scripting: deps.genericIntent.scripting,
  });

  const artifactFetchBlobHandler = createArtifactFetchBlobHandler({
    fetchAuthed: deps.fetchAuthed,
    baseUrl: API_BASE_URL,
    logger: log,
  });

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
    AUTH_COOKIE_EXCHANGE: handleAuthCookieExchange,
    INTENT_DETECTED: handleIntentDetected,
    INTENT_GET: handleIntentGet,
    FILL_REQUEST: handleFillRequest,
    HIGHLIGHT_APPLY: handleHighlightApply,
    HIGHLIGHT_CLEAR: handleHighlightClear,
    KEYWORDS_EXTRACT: handleKeywordsExtract,
    HIGHLIGHT_STATUS: handleHighlightStatus,
    GENERATION_START: generationHandlers.GENERATION_START as HandlerFor<'GENERATION_START'>,
    GENERATION_UPDATE: handleGenerationUpdate,
    GENERATION_CANCEL: generationHandlers.GENERATION_CANCEL as HandlerFor<'GENERATION_CANCEL'>,
    GENERATION_SUBSCRIBE: generationHandlers.GENERATION_SUBSCRIBE as HandlerFor<'GENERATION_SUBSCRIBE'>,
    GENERATION_INTERACT: generationHandlers.GENERATION_INTERACT as HandlerFor<'GENERATION_INTERACT'>,
    GENERATION_STARTED: handleGenerationStarted,
    GENERATION_COMPLETE: handleGenerationComplete,
    DETECTED_JOB_BROADCAST: handleDetectedJobBroadcast,
    CREDITS_GET: handleCreditsGet,
    PROFILE_GET: handleProfileGet,
    MASTER_RESUME_GET: masterResumeHandlers.MASTER_RESUME_GET,
    MASTER_RESUME_PUT: masterResumeHandlers.MASTER_RESUME_PUT,
    AGENT_PREFERENCE_GET: agentHandlers.AGENT_PREFERENCE_GET,
    AGENT_PREFERENCE_SET: agentHandlers.AGENT_PREFERENCE_SET,
    AGENT_REGISTRY_LIST: agentHandlers.AGENT_REGISTRY_LIST,
    AGENT_MANIFEST_GET: agentHandlers.AGENT_MANIFEST_GET,
    SESSION_LIST: sessionHandlers.SESSION_LIST as HandlerFor<'SESSION_LIST'>,
    SESSION_GET: sessionHandlers.SESSION_GET as HandlerFor<'SESSION_GET'>,
    SESSION_HYDRATE_GET: sessionHandlers.SESSION_HYDRATE_GET as HandlerFor<'SESSION_HYDRATE_GET'>,
    SESSION_BINDING_PUT: handleSessionBindingPut,
    SESSION_BINDING_GET: handleSessionBindingGet,
    SESSION_SELECTED: handleSessionSelected,
    ARTIFACT_FETCH_BLOB: artifactFetchBlobHandler as HandlerFor<'ARTIFACT_FETCH_BLOB'>,
    GENERIC_INTENT_DETECT: genericIntentHandler as HandlerFor<'GENERIC_INTENT_DETECT'>,
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
  | CreditsGetRequest
  | ProfileGetRequest;

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
  | ClientCreditsSnapshot
  | ClientProfileSnapshot;
