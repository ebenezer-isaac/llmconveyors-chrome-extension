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

export type SessionArtifact = Readonly<{
  type: string;
  label: string;
  storageKey: string | null;
  downloadUrl: string | null;
}>;

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
  | 'error';

export interface UseSessionForCurrentTabResult {
  readonly status: SessionLookupStatus;
  readonly binding: SessionBindingEntry | null;
  readonly session: SessionSummary | null;
  readonly logs: readonly SessionLogEntry[];
  readonly artifacts: readonly SessionArtifact[];
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
): readonly SessionArtifact[] {
  const ArtifactShape = z
    .object({
      type: z.string(),
      storageKey: z.string().optional(),
      label: z.string().optional(),
      name: z.string().optional(),
    })
    .passthrough();
  const out: SessionArtifact[] = [];
  for (const raw of artifactsRaw) {
    const parsed = ArtifactShape.safeParse(raw);
    if (!parsed.success) continue;
    const storageKey =
      typeof parsed.data.storageKey === 'string' && parsed.data.storageKey.length > 0
        ? parsed.data.storageKey
        : null;
    const label =
      (typeof parsed.data.label === 'string' && parsed.data.label.length > 0
        ? parsed.data.label
        : typeof parsed.data.name === 'string' && parsed.data.name.length > 0
        ? parsed.data.name
        : parsed.data.type) ?? 'artifact';
    const downloadUrl =
      storageKey !== null
        ? `${clientEnv.apiBaseUrl}/api/v1/sessions/${encodeURIComponent(sessionId)}/download?key=${encodeURIComponent(storageKey)}`
        : null;
    out.push({
      type: parsed.data.type,
      label,
      storageKey,
      downloadUrl,
    });
  }
  return out;
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

async function fetchHydrated(
  sessionId: string,
  sendMessage: (msg: unknown) => Promise<unknown>,
): Promise<
  | {
      readonly kind: 'ok';
      readonly summary: SessionSummary;
      readonly logs: readonly SessionLogEntry[];
      readonly artifacts: readonly SessionArtifact[];
    }
  | { readonly kind: 'not-found' }
  | { readonly kind: 'signed-out' }
  | { readonly kind: 'error'; readonly error: string }
> {
  let raw: unknown;
  try {
    raw = await sendMessage({
      key: 'SESSION_HYDRATE_GET',
      data: { sessionId },
    });
  } catch (err: unknown) {
    return { kind: 'error', error: err instanceof Error ? err.message : String(err) };
  }
  const parsed = SessionHydrateGetResponseSchema.safeParse(raw);
  if (!parsed.success) return { kind: 'error', error: 'shape-mismatch' };
  return translateHydrateResponse(parsed.data, sessionId);
}

function translateHydrateResponse(
  response: SessionHydrateGetResponse,
  sessionId: string,
):
  | {
      readonly kind: 'ok';
      readonly summary: SessionSummary;
      readonly logs: readonly SessionLogEntry[];
      readonly artifacts: readonly SessionArtifact[];
    }
  | { readonly kind: 'not-found' }
  | { readonly kind: 'signed-out' }
  | { readonly kind: 'error'; readonly error: string } {
  if (!response.ok) {
    if (response.reason === 'not-found') return { kind: 'not-found' };
    if (response.reason === 'signed-out') return { kind: 'signed-out' };
    return { kind: 'error', error: response.reason };
  }
  const payload: HydratePayload = response.payload;
  const summary = extractSummary(payload.session);
  return {
    kind: 'ok',
    summary: {
      ...summary,
      sessionId: summary.sessionId.length > 0 ? summary.sessionId : sessionId,
    },
    logs: normalizeLogs(payload.generationLogs ?? [], ''),
    artifacts: normalizeArtifacts(payload.artifacts ?? [], sessionId),
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
  const [artifacts, setArtifacts] = useState<readonly SessionArtifact[]>([]);
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
      if (found === null) {
        setStatus('not-found');
        setBinding(null);
        setSession(null);
        setLogs([]);
        setArtifacts([]);
        return;
      }
      const dismissKey = `${found.urlKey}|${found.agentId}`;
      if (dismissedRef.current === dismissKey) {
        setStatus('not-found');
        setBinding(null);
        return;
      }
      setBinding(found);
      const outcome = await fetchHydrated(found.sessionId, sendMessage);
      if (cancelled) return;
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
      setStatus('error');
      setError(outcome.error);
    }
    void run();
    return () => {
      cancelled = true;
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
