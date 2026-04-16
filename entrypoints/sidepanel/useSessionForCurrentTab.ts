// SPDX-License-Identifier: MIT
/**
 * Resolves the persisted session binding for the current tab URL + active
 * agent, and lazy-loads the session's detail (hydrate endpoint) so the
 * sidepanel can render a "last session" panel without the user needing to
 * click anything.
 *
 * Backend hydrate endpoint reference:
 *   e:/llmconveyors.com/api/src/modules/sessions/sessions.controller.ts:204
 *   (GET /api/v1/sessions/:id/hydrate returns
 *    { session, artifacts, generationLogs, ... }).
 *
 * The hydrate fetch is delegated to the background via SESSION_HYDRATE_GET
 * so the SessionManager's proactive refresh + silent 401 retry path applies
 * to every authenticated backend call. React components never call the
 * backend with a bearer token directly.
 *
 * Status lifecycle:
 *   idle      -> loading -> found / not-found / error
 *
 * Transitions reset when the target tab changes.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import type { AgentId } from '@/src/background/agents';
import { SessionBindingEntrySchema } from '@/src/background/messaging/schemas/session-binding.schema';
import type { SessionBindingEntry } from '@/src/background/messaging/schemas/session-binding.schema';
import {
  readSelectedSession,
  clearSelectedSession,
} from '@/src/background/sessions/session-selection';
import {
  normalizeArtifactPreview,
  type ArtifactPreview,
} from '@/src/background/messaging/schemas/artifact-preview.schema';
import {
  buildArtifactFilename,
  defaultFilenameForType,
  type NamingMetadata,
} from './lib/filename';
import {
  SessionHydrateGetResponseSchema,
  type SessionHydrateGetResponse,
  type HydratePayload,
  type HydrateSessionDoc,
} from '@/src/background/messaging/schemas/session-list.schema';
import { clientEnv } from '@/src/shared/env';

type RuntimeMessenger = {
  sendMessage: (msg: unknown) => Promise<unknown>;
};

function getRuntime(): RuntimeMessenger | null {
  const g = globalThis as unknown as {
    chrome?: { runtime?: RuntimeMessenger };
    browser?: { runtime?: RuntimeMessenger };
  };
  return g.chrome?.runtime ?? g.browser?.runtime ?? null;
}

type TabsLookup = {
  get?: (id: number, cb: (tab: { url?: string; title?: string } | undefined) => void) => void;
  query?: (
    info: { active?: boolean; currentWindow?: boolean },
  ) => Promise<Array<{ id?: number; url?: string; title?: string }>>;
};

function getTabs(): TabsLookup | null {
  const g = globalThis as unknown as {
    chrome?: { tabs?: TabsLookup };
    browser?: { tabs?: TabsLookup };
  };
  return g.chrome?.tabs ?? g.browser?.tabs ?? null;
}

async function resolveActiveTabUrl(tabId: number | null): Promise<string | null> {
  const tabs = getTabs();
  if (tabs === null) return null;
  if (tabId !== null && typeof tabs.get === 'function') {
    return new Promise((resolvePromise) => {
      try {
        tabs.get!(tabId, (tab) => resolvePromise(tab?.url ?? null));
      } catch {
        resolvePromise(null);
      }
    });
  }
  if (typeof tabs.query === 'function') {
    try {
      const list = await tabs.query({ active: true, currentWindow: true });
      const active = list[0];
      return active?.url ?? null;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Legacy alias kept so existing consumers (popup, tests) keep compiling
 * during the sidepanel redesign. New consumers should import
 * ArtifactPreview from the schema file directly.
 */
export type SessionArtifact = ArtifactPreview;

export type SessionLogEntry = Readonly<{
  phase: string | null;
  message: string;
  timestamp: number;
  level: string | null;
}>;

export type SessionSummary = Readonly<{
  sessionId: string;
  companyName: string | null;
  jobTitle: string | null;
  status: string | null;
  updatedAt: number | null;
}>;

export type SessionLookupStatus =
  | 'idle'
  | 'loading'
  | 'found'
  | 'not-found'
  | 'bg-unreachable'
  | 'error';

export interface UseSessionForCurrentTabResult {
  readonly status: SessionLookupStatus;
  readonly binding: SessionBindingEntry | null;
  readonly session: SessionSummary | null;
  readonly logs: readonly SessionLogEntry[];
  readonly artifacts: readonly ArtifactPreview[];
  readonly error: string | null;
  readonly dismiss: () => void;
  readonly refresh: () => void;
}

const SessionBindingGetResponseSchema = SessionBindingEntrySchema.nullable();

const LogEntrySchema = z
  .object({
    phase: z.string().optional().nullable(),
    message: z.string().optional(),
    content: z.string().optional(),
    text: z.string().optional(),
    timestamp: z.union([z.string(), z.number()]).optional(),
    createdAt: z.union([z.string(), z.number()]).optional(),
    level: z.string().optional().nullable(),
  })
  .passthrough();

function toEpochMs(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string') {
    const parsed = Date.parse(raw);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeLogs(
  generationLogs: readonly unknown[],
  filterGenerationId: string,
): readonly SessionLogEntry[] {
  const out: SessionLogEntry[] = [];
  for (const raw of generationLogs) {
    if (raw === null || typeof raw !== 'object') continue;
    const asRecord = raw as Record<string, unknown>;
    const gid = typeof asRecord.generationId === 'string' ? asRecord.generationId : null;
    // Some backend variants nest log entries under a `logs: []` array per
    // generation. Handle both shapes.
    const entriesRaw = Array.isArray(asRecord.logs)
      ? asRecord.logs
      : Array.isArray(asRecord.entries)
      ? asRecord.entries
      : [raw];
    if (gid !== null && gid !== filterGenerationId && entriesRaw === asRecord.logs) {
      // A generation group that does not match; skip.
      continue;
    }
    for (const entryRaw of entriesRaw) {
      const parsed = LogEntrySchema.safeParse(entryRaw);
      if (!parsed.success) continue;
      const phase =
        typeof parsed.data.phase === 'string' && parsed.data.phase.length > 0
          ? parsed.data.phase
          : null;
      const message =
        typeof parsed.data.message === 'string'
          ? parsed.data.message
          : typeof parsed.data.content === 'string'
          ? parsed.data.content
          : typeof parsed.data.text === 'string'
          ? parsed.data.text
          : '';
      if (message.length === 0 && phase === null) continue;
      const tsRaw = parsed.data.timestamp ?? parsed.data.createdAt;
      const timestamp = toEpochMs(tsRaw) ?? 0;
      out.push({
        phase,
        message,
        timestamp,
        level:
          typeof parsed.data.level === 'string' && parsed.data.level.length > 0
            ? parsed.data.level
            : null,
      });
    }
  }
  out.sort((a, b) => a.timestamp - b.timestamp);
  return out;
}

function normalizeArtifacts(
  artifactsRaw: readonly unknown[],
  sessionId: string,
  summary: SessionSummary,
): readonly ArtifactPreview[] {
  const namingMeta: NamingMetadata = {
    ...(summary.companyName !== null ? { companyName: summary.companyName } : {}),
    ...(summary.jobTitle !== null ? { jobTitle: summary.jobTitle } : {}),
  };
  const out: ArtifactPreview[] = [];
  for (const raw of artifactsRaw) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    const storageKey =
      typeof r.storageKey === 'string' && r.storageKey.length > 0 ? r.storageKey : undefined;
    // Derive a download URL if the backend gave us a storage key but no
    // signed URL. Same pattern the web dashboard's TextArtifactCard uses.
    const downloadUrl =
      typeof r.downloadUrl === 'string' && r.downloadUrl.length > 0
        ? r.downloadUrl
        : storageKey !== undefined
        ? `${clientEnv.apiBaseUrl}/api/v1/sessions/${encodeURIComponent(sessionId)}/download?key=${encodeURIComponent(storageKey)}`
        : undefined;

    // Build a filename up-front so the card does not need the session
    // naming metadata at render time.
    const preliminaryType =
      typeof r.type === 'string' ? r.type : typeof r.kind === 'string' ? r.kind : 'other';
    const canonical = canonicalTypeForFilename(preliminaryType);
    const { suffix, ext } = defaultFilenameForType(
      canonical,
      typeof r.mimeType === 'string' ? r.mimeType : null,
    );
    const filename = buildArtifactFilename(namingMeta, suffix, ext);

    const normalized = normalizeArtifactPreview(
      {
        ...r,
        ...(downloadUrl !== undefined ? { downloadUrl } : {}),
      },
      filename,
    );
    if (normalized !== null) out.push(normalized);
  }
  return out;
}

function canonicalTypeForFilename(raw: string): string {
  const lower = raw.toLowerCase().replace(/_/g, '-');
  if (lower === 'cv' || lower === 'resume') return 'cv';
  if (lower === 'cover-letter' || lower === 'cover' || lower === 'letter') return 'cover-letter';
  if (lower === 'cold-email' || lower === 'email' || lower === 'outreach') return 'cold-email';
  if (lower === 'ats' || lower === 'ats-comparison' || lower === 'ats-report') {
    return 'ats-comparison';
  }
  if (lower === 'research' || lower === 'deep-research' || lower === 'company-research') {
    return 'deep-research';
  }
  return 'other';
}

function extractSummary(sessionDoc: HydrateSessionDoc): SessionSummary {
  const metadata = (sessionDoc.metadata ?? {}) as Record<string, unknown>;
  const companyName =
    typeof metadata.companyName === 'string' && metadata.companyName.length > 0
      ? metadata.companyName
      : null;
  const jobTitle =
    typeof metadata.jobTitle === 'string' && metadata.jobTitle.length > 0
      ? metadata.jobTitle
      : null;
  const status =
    typeof sessionDoc.status === 'string' && sessionDoc.status.length > 0
      ? sessionDoc.status
      : null;
  const sessionId =
    typeof sessionDoc.id === 'string' && sessionDoc.id.length > 0
      ? sessionDoc.id
      : typeof sessionDoc._id === 'string'
      ? sessionDoc._id
      : '';
  return {
    sessionId,
    companyName,
    jobTitle,
    status,
    updatedAt: toEpochMs(sessionDoc.updatedAt),
  };
}

export interface UseSessionForCurrentTabOptions {
  readonly tabId: number | null;
  readonly agentId: AgentId | null;
  readonly signedIn: boolean;
  /**
   * Test-only override for the runtime messenger. Production uses
   * `chrome.runtime.sendMessage` via the default resolver.
   */
  readonly sendMessage?: (msg: unknown) => Promise<unknown>;
}

async function fetchBinding(
  url: string,
  agentId: AgentId,
  sendMessage: (msg: unknown) => Promise<unknown>,
): Promise<SessionBindingEntry | null> {
  const raw = await sendMessage({
    key: 'SESSION_BINDING_GET',
    data: { url, agentId },
  });
  const parsed = SessionBindingGetResponseSchema.safeParse(raw);
  if (!parsed.success) return null;
  return parsed.data;
}

/**
 * Fallback: when no tab-bound session exists for the current URL, look up
 * the most recent session for this agent so the sidepanel can still show
 * something useful (last artifacts + logs) instead of the empty
 * "No active generation" state. Mirrors what the web dashboard does on
 * initial load.
 */
async function fetchMostRecentAgentSessionId(
  agentId: AgentId,
  sendMessage: (msg: unknown) => Promise<unknown>,
): Promise<string | null> {
  const raw = await sendMessage({
    key: 'SESSION_LIST',
    data: { limit: 20, forceRefresh: false },
  });
  if (raw === null || typeof raw !== 'object') return null;
  const env = raw as { ok?: boolean; items?: unknown };
  if (env.ok !== true || !Array.isArray(env.items)) return null;
  for (const item of env.items) {
    if (!item || typeof item !== 'object') continue;
    const it = item as { agentType?: unknown; sessionId?: unknown };
    if (it.agentType === agentId && typeof it.sessionId === 'string') {
      return it.sessionId;
    }
  }
  return null;
}

type FetchHydratedOutcome =
  | {
      readonly kind: 'ok';
      readonly summary: SessionSummary;
      readonly logs: readonly SessionLogEntry[];
      readonly artifacts: readonly ArtifactPreview[];
    }
  | { readonly kind: 'not-found' }
  | { readonly kind: 'signed-out' }
  | { readonly kind: 'bg-unreachable' }
  | { readonly kind: 'error'; readonly error: string };

async function fetchHydrated(
  sessionId: string,
  sendMessage: (msg: unknown) => Promise<unknown>,
): Promise<FetchHydratedOutcome> {
  let raw: unknown;
  try {
    raw = await sendMessage({
      key: 'SESSION_HYDRATE_GET',
      data: { sessionId },
    });
  } catch (err: unknown) {
    return { kind: 'error', error: err instanceof Error ? err.message : String(err) };
  }
  // The MV3 service worker can be asleep when the sidepanel mounts; the
  // first sendMessage then resolves with `undefined` (no listener responded
  // before the channel closed) or `null` from the polyfill. Surface this as
  // a distinct outcome so the caller can retry once instead of treating it
  // as a permanent shape mismatch.
  if (raw === null || raw === undefined) {
    return { kind: 'bg-unreachable' };
  }
  const parsed = SessionHydrateGetResponseSchema.safeParse(raw);
  if (!parsed.success) return { kind: 'error', error: 'shape-mismatch' };
  return translateHydrateResponse(parsed.data, sessionId);
}

function translateHydrateResponse(
  response: SessionHydrateGetResponse,
  sessionId: string,
): FetchHydratedOutcome {
  if (!response.ok) {
    if (response.reason === 'not-found') return { kind: 'not-found' };
    if (response.reason === 'signed-out') return { kind: 'signed-out' };
    return { kind: 'error', error: response.reason };
  }
  const payload: HydratePayload = response.payload;
  const summary: SessionSummary = {
    ...extractSummary(payload.session),
    sessionId: extractSummary(payload.session).sessionId.length > 0
      ? extractSummary(payload.session).sessionId
      : sessionId,
  };
  return {
    kind: 'ok',
    summary,
    logs: normalizeLogs(payload.generationLogs ?? [], ''),
    artifacts: normalizeArtifacts(payload.artifacts ?? [], sessionId, summary),
  };
}

function defaultSendMessage(msg: unknown): Promise<unknown> {
  const runtime = getRuntime();
  if (runtime === null) return Promise.resolve(null);
  return runtime.sendMessage(msg);
}

export function useSessionForCurrentTab(
  opts: UseSessionForCurrentTabOptions,
): UseSessionForCurrentTabResult {
  const [status, setStatus] = useState<SessionLookupStatus>('idle');
  const [binding, setBinding] = useState<SessionBindingEntry | null>(null);
  const [session, setSession] = useState<SessionSummary | null>(null);
  const [logs, setLogs] = useState<readonly SessionLogEntry[]>([]);
  const [artifacts, setArtifacts] = useState<readonly ArtifactPreview[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState<number>(0);
  const dismissedRef = useRef<string | null>(null);

  const dismiss = useCallback(() => {
    dismissedRef.current = binding !== null ? `${binding.urlKey}|${binding.agentId}` : '';
    setStatus('not-found');
    setBinding(null);
    setSession(null);
    setLogs([]);
    setArtifacts([]);
    setError(null);
    // If an explicit selection was driving this panel, wipe it so a
    // subsequent run falls back to URL-binding / most-recent.
    void clearSelectedSession();
  }, [binding]);

  const refresh = useCallback(() => {
    dismissedRef.current = null;
    setNonce((n) => n + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const sendMessage = opts.sendMessage ?? defaultSendMessage;
    async function run(): Promise<void> {
      if (!opts.signedIn || opts.agentId === null) {
        if (!cancelled) {
          setStatus('idle');
          setBinding(null);
          setSession(null);
          setLogs([]);
          setArtifacts([]);
          setError(null);
        }
        return;
      }

      // Priority 1: explicit selection from the popup's session list.
      // Persisted in chrome.storage.local so the sidepanel picks it up
      // even when it was opened by the same click that selected.
      const selected = await readSelectedSession();
      if (cancelled) return;
      if (selected !== null && selected.agentId === opts.agentId) {
        setStatus('loading');
        setError(null);
        const resolved: SessionBindingEntry = {
          urlKey: '',
          agentId: opts.agentId,
          sessionId: selected.sessionId,
          generationId: '',
          pageTitle: null,
          createdAt: 0,
          updatedAt: selected.selectedAt,
        };
        setBinding(resolved);
        let outcome = await fetchHydrated(resolved.sessionId, sendMessage);
        if (cancelled) return;
        if (outcome.kind === 'bg-unreachable') {
          await new Promise((resolve) => setTimeout(resolve, 200));
          if (cancelled) return;
          outcome = await fetchHydrated(resolved.sessionId, sendMessage);
          if (cancelled) return;
        }
        if (outcome.kind === 'ok') {
          setSession(outcome.summary);
          setLogs(outcome.logs);
          setArtifacts(outcome.artifacts);
          setStatus('found');
          return;
        }
        if (outcome.kind === 'not-found') {
          // Selection references a deleted session; clear it and fall
          // through to the URL-binding / most-recent flow below.
          await clearSelectedSession();
        } else if (outcome.kind === 'signed-out') {
          setStatus('idle');
          setBinding(null);
          setSession(null);
          setLogs([]);
          setArtifacts([]);
          return;
        } else if (outcome.kind === 'bg-unreachable') {
          setStatus('bg-unreachable');
          setError('background unreachable');
          return;
        } else {
          // Network / shape error on an explicit selection: surface
          // rather than silently falling back. The user made a choice.
          setStatus('error');
          setError(outcome.error);
          return;
        }
      }

      const tabUrl = await resolveActiveTabUrl(opts.tabId);
      if (cancelled) return;
      if (typeof tabUrl !== 'string' || tabUrl.length === 0) {
        setStatus('not-found');
        setBinding(null);
        setSession(null);
        setLogs([]);
        setArtifacts([]);
        setError(null);
        return;
      }
      if (!tabUrl.startsWith('http://') && !tabUrl.startsWith('https://')) {
        setStatus('not-found');
        setBinding(null);
        setSession(null);
        setLogs([]);
        setArtifacts([]);
        setError(null);
        return;
      }
      setStatus('loading');
      setError(null);
      let found: SessionBindingEntry | null;
      try {
        found = await fetchBinding(tabUrl, opts.agentId, sendMessage);
      } catch (err: unknown) {
        if (cancelled) return;
        setStatus('error');
        setError(err instanceof Error ? err.message : String(err));
        return;
      }
      if (cancelled) return;
      let resolved: SessionBindingEntry;
      if (found === null) {
        // Fallback: hydrate the user's most-recent session for this agent
        // so the sidepanel always has content to show on load (matching
        // the web dashboard's default landing behaviour).
        const fallbackId = await fetchMostRecentAgentSessionId(
          opts.agentId,
          sendMessage,
        );
        if (cancelled) return;
        if (fallbackId === null) {
          setStatus('not-found');
          setBinding(null);
          setSession(null);
          setLogs([]);
          setArtifacts([]);
          return;
        }
        // Synthesize a binding-like entry so the existing render path
        // picks up the session. urlKey is '' because this is not a
        // URL-bound session; consumers that care can check `binding.urlKey`.
        resolved = {
          urlKey: '',
          agentId: opts.agentId,
          sessionId: fallbackId,
          generationId: '',
          pageTitle: null,
          createdAt: 0,
          updatedAt: 0,
        };
      } else {
        resolved = found;
      }
      const dismissKey = `${resolved.urlKey}|${resolved.agentId}`;
      if (dismissedRef.current === dismissKey) {
        setStatus('not-found');
        setBinding(null);
        return;
      }
      setBinding(resolved);
      let outcome = await fetchHydrated(resolved.sessionId, sendMessage);
      if (cancelled) return;
      if (outcome.kind === 'bg-unreachable') {
        // Service worker likely asleep on first message after sidepanel
        // mount. Wait for the runtime to wake (it now has our pending
        // listener registration) and retry exactly once before surfacing
        // the unreachable state to the UI.
        await new Promise((resolve) => setTimeout(resolve, 200));
        if (cancelled) return;
        outcome = await fetchHydrated(resolved.sessionId, sendMessage);
        if (cancelled) return;
      }
      if (outcome.kind === 'ok') {
        setSession(outcome.summary);
        setLogs(outcome.logs);
        setArtifacts(outcome.artifacts);
        setStatus('found');
        return;
      }
      if (outcome.kind === 'not-found') {
        // Binding points to a deleted session; treat as absent.
        setBinding(null);
        setSession(null);
        setLogs([]);
        setArtifacts([]);
        setStatus('not-found');
        return;
      }
      if (outcome.kind === 'signed-out') {
        setStatus('idle');
        setBinding(null);
        setSession(null);
        setLogs([]);
        setArtifacts([]);
        return;
      }
      if (outcome.kind === 'bg-unreachable') {
        setStatus('bg-unreachable');
        setError('background unreachable');
        return;
      }
      setStatus('error');
      setError(outcome.error);
    }
    void run();

    // Live sync: if the popup broadcasts SESSION_SELECTED while the
    // sidepanel is already mounted, re-run the resolver so the new
    // session hydrates. The durable storage path covers the case where
    // the sidepanel mounts AFTER the broadcast.
    const runtimeG = globalThis as unknown as {
      chrome?: {
        runtime?: {
          onMessage?: {
            addListener: (fn: (msg: unknown) => void) => void;
            removeListener: (fn: (msg: unknown) => void) => void;
          };
        };
      };
    };
    const onRuntimeMessage = (msg: unknown): void => {
      if (!msg || typeof msg !== 'object') return;
      const env = msg as { key?: string; data?: { agentId?: string } };
      if (env.key !== 'SESSION_SELECTED') return;
      if (env.data?.agentId !== opts.agentId) return;
      // Clear the dismiss flag for any prior session and re-run.
      dismissedRef.current = null;
      setNonce((n) => n + 1);
    };
    runtimeG.chrome?.runtime?.onMessage?.addListener(onRuntimeMessage);

    return () => {
      cancelled = true;
      runtimeG.chrome?.runtime?.onMessage?.removeListener(onRuntimeMessage);
    };
  }, [opts.tabId, opts.agentId, opts.signedIn, opts.sendMessage, nonce]);

  return {
    status,
    binding,
    session,
    logs,
    artifacts,
    error,
    dismiss,
    refresh,
  };
}
