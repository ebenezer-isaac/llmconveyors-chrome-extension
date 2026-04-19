// SPDX-License-Identifier: MIT
/**
 * Register every background-owned handler against the live browser runtime.
 *
 * Integration tests import this module AFTER mounting `@webext-core/fake-browser`,
 * so the `browser.runtime.onMessage` addListener here binds to the fake runtime.
 * Production imports it from entrypoints/background.ts during service-worker
 * startup.
 *
 * Message envelope on the wire is `{ key: string; data: unknown }`, matching
 * both the integration tests and the @webext-core/messaging internal format.
 * When a non-enveloped raw message arrives (legacy sender), we dispatch
 * defensively via the `type` field.
 */

import { browser } from 'wxt/browser';
import { createLogger } from '../log';
import {
  LOG_SCOPES,
  AUTH_EXCHANGE_ENDPOINT,
  AUTH_COOKIE_SYNC_ENDPOINT,
  AUTH_SIGN_OUT_ENDPOINT,
  EXTRACT_SKILLS_ENDPOINT,
  EXTRACT_JD_ENDPOINT,
  SETTINGS_PROFILE_ENDPOINT,
  GENERATION_START_ENDPOINT,
  MASTER_RESUME_ENDPOINT,
} from '../config';
import {
  clearAllTabState,
  getTabState,
  setIntent,
} from '../storage/tab-state';
import {
  createMasterResumeCache,
  createMasterResumeClient,
} from '../master-resume';
import {
  createAgentManifestClient,
  createAgentPreference,
} from '../agents';
import {
  createSessionListClient,
  createSessionListCache,
  createSessionBindingStore,
  createSessionHydrateClient,
} from '../sessions';
import {
  createAgentClient,
  createSseManager,
} from '../generation';
import {
  API_BASE_URL,
  SESSIONS_ENDPOINT,
  buildAgentGenerateUrl,
  buildAgentInteractUrl,
  buildSseStreamUrl,
  GENERATION_CANCEL_ENDPOINT,
} from '../config';
import type { AgentType } from '../generation';
import type { BgHandledKey } from './protocol';
import { BG_HANDLED_KEYS } from './protocol';
import { createHandlers, type Handlers, type HandlerDeps } from './handlers';
import type { DetectedIntent } from './schemas/intent.schema';
import type { HighlightStatus } from './schemas/highlight.schema';
import {
  createFetchAuthed,
  type FetchAuthed,
} from '../auth';
import { clientEnv } from '../../shared/env';

const logger = createLogger(LOG_SCOPES.handlers);

function buildProductionDeps(): HandlerDeps {
  const fetchFn = globalThis.fetch.bind(globalThis);
  
  const fetchAuthed: FetchAuthed = createFetchAuthed({
    fetch: fetchFn,
    logger: createLogger('bg.fetchAuthed'),
    onAuthFailed: async () => {
      try {
        await browser.runtime.sendMessage({ key: 'AUTH_STATE_CHANGED', data: { signedIn: false } });
      } catch { /* ignore */ }
    },
  });

  const chromeStorage = {
    get: async (key: string) => {
      const raw = await chrome.storage.local.get(key);
      return raw as Record<string, unknown>;
    },
    set: async (items: Record<string, unknown>) => {
      await chrome.storage.local.set(items);
    },
    remove: async (key: string) => {
      await chrome.storage.local.remove(key);
    },
  };
  const masterResumeCache = createMasterResumeCache({
    storage: chromeStorage,
    logger,
    now: () => Date.now(),
  });
  const masterResumeClient = createMasterResumeClient({
    fetchAuthed,
    logger,
    endpoint: MASTER_RESUME_ENDPOINT,
  });
  const agentPreference = createAgentPreference({
    storage: chromeStorage,
    logger,
    now: () => Date.now(),
  });
  const agentManifestClient = createAgentManifestClient({
    fetchAuthed,
    logger,
    buildUrl: (agentId) => `${API_BASE_URL}/api/v1/agents/${agentId}/manifest`,
  });

  const sessionsLogger = createLogger('bg.sessions');
  const sessionListClient = createSessionListClient({
    fetchAuthed,
    logger: sessionsLogger,
    baseUrl: SESSIONS_ENDPOINT,
  });
  const sessionHydrateClient = createSessionHydrateClient({
    fetchAuthed,
    logger: sessionsLogger,
    buildUrl: (sessionId) =>
      `${SESSIONS_ENDPOINT}/${encodeURIComponent(sessionId)}/hydrate`,
  });
  const sessionListCache = createSessionListCache({
    storage: chromeStorage,
    logger: sessionsLogger,
    now: () => Date.now(),
  });
  const sessionBindingStore = createSessionBindingStore({
    storage: chromeStorage,
    logger: sessionsLogger,
    now: () => Date.now(),
  });

  const generationLogger = createLogger('bg.generation');
  const agentClient = createAgentClient({
    fetchAuthed,
    logger: generationLogger,
    buildGenerateUrl: (agentType: AgentType) => buildAgentGenerateUrl(agentType),
    buildInteractUrl: (agentType: AgentType) => buildAgentInteractUrl(agentType),
  });
  const sseManager = createSseManager({
    logger: generationLogger,
    buildUrl: (generationId: string) => buildSseStreamUrl(generationId),
    fetchAuthed,
    broadcast: async (msg) => {
      try {
        await browser.runtime.sendMessage(msg);
      } catch { /* ignore */ }
    },
    onAuthLost: async () => {
      // Nothing special required anymore, fetchAuthed natively handles refreshes.
      return false;
    },
  });

  const scriptingApi = {
    executeScript: async (args: {
      target: { tabId: number };
      func: (...injectArgs: readonly unknown[]) => unknown;
      args: readonly unknown[];
    }): Promise<ReadonlyArray<{ result?: unknown }>> => {
      const g = globalThis as unknown as {
        chrome?: {
          scripting?: {
            executeScript: (opts: unknown) => Promise<ReadonlyArray<{ result?: unknown }>>;
          };
        };
      };
      const scripting = g.chrome?.scripting;
      if (!scripting) {
        throw new Error('chrome.scripting not available');
      }
      return scripting.executeScript({
        target: args.target,
        func: args.func,
        args: args.args,
        world: 'MAIN',
      } as unknown);
    },
  };

  return {
    logger,
    fetch: fetchFn,
    fetchAuthed,
    now: () => Date.now(),
    tabState: {
      getIntent: (tabId: number): DetectedIntent | null => getTabState(tabId).intent,
      setIntent,
      getHighlight: (tabId: number): HighlightStatus => getTabState(tabId).highlight,
      clearAll: clearAllTabState,
    },
    broadcast: {
      sendRuntime: async (msg) => {
        try {
          await browser.runtime.sendMessage(msg);
        } catch (err) {
          logger.debug('sendRuntime: no listener or runtime closed', {
            error: String(err),
          });
        }
      },
      sendToTab: async (tabId: number, message: unknown) => {
        return browser.tabs.sendMessage(tabId, message);
      },
    },
    endpoints: {
      authExchange: AUTH_EXCHANGE_ENDPOINT,
      authCookieSync: AUTH_COOKIE_SYNC_ENDPOINT,
      authSignOut: AUTH_SIGN_OUT_ENDPOINT,
      extractSkills: EXTRACT_SKILLS_ENDPOINT,
      extractJd: EXTRACT_JD_ENDPOINT,
      settingsProfile: SETTINGS_PROFILE_ENDPOINT,
      generationStart: GENERATION_START_ENDPOINT,
      generationCancel: GENERATION_CANCEL_ENDPOINT,
    },
    masterResume: {
      client: masterResumeClient,
      cache: masterResumeCache,
    },
    agents: {
      preference: agentPreference,
      manifestClient: agentManifestClient,
    },
    sessions: {
      client: sessionListClient,
      hydrateClient: sessionHydrateClient,
      cache: sessionListCache,
      bindings: sessionBindingStore,
    },
    generation: {
      agentClient,
      sse: sseManager,
      cancelEndpoint: {
        cancel: async (generationId: string): Promise<{ ok: boolean }> => {
          const result = await fetchAuthed(GENERATION_CANCEL_ENDPOINT, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ generationId }),
          });
          if (result.kind === 'unauthenticated') return { ok: false };
          if (result.kind === 'network-error') {
            generationLogger.warn('cancel endpoint failed', {
              error: result.error.message,
            });
            return { ok: false };
          }
          return { ok: result.response.ok };
        },
      },
    },

    genericIntent: {
      scripting: scriptingApi as never,
    },
    webBaseUrl: clientEnv.webBaseUrl,
  };
}

type MessageEnvelope = {
  readonly key?: string;
  readonly type?: string;
  readonly data?: unknown;
};

function isHandledKey(key: string): key is BgHandledKey {
  return (BG_HANDLED_KEYS as readonly string[]).includes(key);
}

/**
 * webext-core/messaging wraps every sendMessage in `{id, type, data, timestamp}`
 * and expects responses wrapped as `{res, err}`. Detect its format so we can
 * emit the matching envelope; raw chrome.runtime.sendMessage callers that use
 * `{key, data}` get the plain result.
 */
function isWebextCoreMessage(msg: unknown): boolean {
  if (msg === null || typeof msg !== 'object') return false;
  const m = msg as Record<string, unknown>;
  return (
    typeof m.type === 'string' &&
    typeof m.timestamp === 'number' &&
    typeof m.id !== 'undefined'
  );
}

/**
 * Dispatch a single incoming message to the matching handler. Returns the
 * handler's resolved value, or `undefined` when no key matches (so the
 * runtime lets other listeners try).
 */
async function dispatch(
  handlers: Handlers,
  msg: unknown,
  sender: chrome.runtime.MessageSender,
): Promise<unknown> {
  if (msg === null || typeof msg !== 'object') return undefined;
  const env = msg as MessageEnvelope;
  const key = env.key ?? env.type;
  if (typeof key !== 'string' || !isHandledKey(key)) return undefined;
  const handler = handlers[key];
  // Each handler's data parameter type is already enforced by the factory's
  // Handlers type. The envelope's `data` is validated again by the handler's
  // own Zod schema.
  const result = await handler({
    data: env.data as never,
    sender,
  });
  return result;
}

let registered = false;
let handlersSingleton: Handlers | null = null;

/**
 * Register all BG handlers with the runtime. Idempotent: safe to call more
 * than once (second call is a no-op). Used by the integration test harness
 * and by entrypoints/background.ts at service-worker startup.
 */
export function registerHandlers(customDeps?: Partial<HandlerDeps>): Handlers {
  if (registered && handlersSingleton !== null) return handlersSingleton;
  const baseDeps = buildProductionDeps();
  const deps: HandlerDeps = customDeps
    ? {
        ...baseDeps,
        ...customDeps,
        tabState: { ...baseDeps.tabState, ...(customDeps.tabState ?? {}) },
        broadcast: { ...baseDeps.broadcast, ...(customDeps.broadcast ?? {}) },
        endpoints: { ...baseDeps.endpoints, ...(customDeps.endpoints ?? {}) },
        masterResume: customDeps.masterResume ?? baseDeps.masterResume,
        agents: customDeps.agents ?? baseDeps.agents,
        sessions: customDeps.sessions ?? baseDeps.sessions,
        generation: customDeps.generation ?? baseDeps.generation,
        genericIntent: customDeps.genericIntent ?? baseDeps.genericIntent,
      }
    : baseDeps;
  const handlers = createHandlers(deps);
  handlersSingleton = handlers;

  // Dual-mode listener. Chrome MV3 native runtime requires the classic
  // `return true` + `sendResponse(...)` pattern because a Promise return
  // is not reliably awaited across the service-worker / content-script
  // boundary in Manifest V3. The fake-browser harness used by integration
  // tests, however, consumes the listener return value directly via
  // Promise.all and does not pass a sendResponse callback. We branch on
  // the presence of the callback argument: when Chrome is real it arrives
  // as a function; under fake-browser it is undefined and we return the
  // dispatch Promise directly instead.
  //
  // Response envelope: when the incoming message is webext-core format
  // ({id, type, timestamp, data}), the caller unwraps `response.res`
  // and throws `response.err`. Raw chrome senders expect the plain
  // result. We detect webext-core by the presence of numeric `timestamp`
  // + `id` and wrap the response accordingly.
  browser.runtime.onMessage.addListener(
    (
      message: unknown,
      sender: chrome.runtime.MessageSender,
      sendResponse: ((resp: unknown) => void) | undefined,
    ) => {
      const isWebextCore = isWebextCoreMessage(message);
      const resultPromise = dispatch(handlers, message, sender).then(
        (result) => (isWebextCore ? { res: result } : result),
        (err: unknown) => {
          logger.warn('dispatch rejected', {
            error: err instanceof Error ? err.message : String(err),
          });
          if (isWebextCore) {
            return {
              err: err instanceof Error ? { message: err.message } : { message: String(err) },
            };
          }
          return undefined;
        },
      );
      if (typeof sendResponse === 'function') {
        resultPromise.then((result) => {
          try {
            sendResponse(result);
          } catch {
            // Channel already closed.
          }
        });
        return true;
      }
      return resultPromise;
    },
  );

  registered = true;
  logger.info('registerHandlers: bound onMessage listener', {
    keys: BG_HANDLED_KEYS.length,
  });
  return handlers;
}

/** Test-only: reset registration flag so repeated imports re-wire. */
export function __resetRegistration(): void {
  registered = false;
  handlersSingleton = null;
}
