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
import { LOG_SCOPES } from '../config';
import {
  AUTH_EXCHANGE_ENDPOINT,
  AUTH_SIGN_OUT_ENDPOINT,
  EXTRACT_SKILLS_ENDPOINT,
  USAGE_SUMMARY_ENDPOINT,
  GENERATION_START_ENDPOINT,
  GENERATION_CANCEL_ENDPOINT,
  MASTER_RESUME_ENDPOINT,
} from '../config';
import {
  readSession,
  writeSession,
  clearSession,
} from '../storage/session-storage';
import {
  clearAllTabState,
  getTabState,
  setIntent,
} from '../storage/tab-state';
import {
  createMasterResumeCache,
  createMasterResumeClient,
} from '../master-resume';
import type { BgHandledKey } from './protocol';
import { BG_HANDLED_KEYS } from './protocol';
import { createHandlers, type Handlers, type HandlerDeps } from './handlers';
import type { DetectedIntent } from './schemas/intent.schema';
import type { HighlightStatus } from './schemas/highlight.schema';

const logger = createLogger(LOG_SCOPES.handlers);

function buildProductionDeps(): HandlerDeps {
  const fetchFn = globalThis.fetch.bind(globalThis);
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
    fetch: fetchFn,
    logger,
    endpoint: MASTER_RESUME_ENDPOINT,
    accessToken: async () => {
      const session = await readSession();
      return session?.accessToken ?? null;
    },
  });
  return {
    logger,
    fetch: fetchFn,
    now: () => Date.now(),
    storage: {
      readSession,
      writeSession,
      clearSession,
    },
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
      authSignOut: AUTH_SIGN_OUT_ENDPOINT,
      extractSkills: EXTRACT_SKILLS_ENDPOINT,
      usageSummary: USAGE_SUMMARY_ENDPOINT,
      generationStart: GENERATION_START_ENDPOINT,
      generationCancel: GENERATION_CANCEL_ENDPOINT,
    },
    masterResume: {
      client: masterResumeClient,
      cache: masterResumeCache,
    },
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
        storage: { ...baseDeps.storage, ...(customDeps.storage ?? {}) },
        tabState: { ...baseDeps.tabState, ...(customDeps.tabState ?? {}) },
        broadcast: { ...baseDeps.broadcast, ...(customDeps.broadcast ?? {}) },
        endpoints: { ...baseDeps.endpoints, ...(customDeps.endpoints ?? {}) },
        masterResume: customDeps.masterResume ?? baseDeps.masterResume,
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
  browser.runtime.onMessage.addListener(
    (
      message: unknown,
      sender: chrome.runtime.MessageSender,
      sendResponse: ((resp: unknown) => void) | undefined,
    ) => {
      const promise = dispatch(handlers, message, sender).catch(
        (err: unknown) => {
          logger.warn('dispatch rejected', {
            error: err instanceof Error ? err.message : String(err),
          });
          return undefined;
        },
      );
      if (typeof sendResponse === 'function') {
        promise.then((result) => {
          try {
            sendResponse(result);
          } catch {
            // Channel already closed.
          }
        });
        return true;
      }
      return promise;
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

// Side-effect register on module import. Integration tests rely on this so a
// plain `await import(REGISTER_HANDLERS_MODULE)` wires the listener against
// the fake runtime with no additional step. The entrypoint calls
// `registerHandlers()` explicitly and the flag makes that call idempotent.
registerHandlers();
