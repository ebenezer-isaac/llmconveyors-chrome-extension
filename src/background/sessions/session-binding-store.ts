// SPDX-License-Identifier: MIT
/**
 * Durable per-URL session binding store.
 *
 * Persists `{ urlKey + '|' + agentId -> SessionBinding }` in
 * chrome.storage.local under `llmc.session-binding.v1` so the sidepanel
 * can auto-load a prior session weeks later.
 *
 * Policies:
 *   - LRU cap at SESSION_BINDING_LRU_CAP entries. Writing the (cap+1)th
 *     entry evicts the oldest by `updatedAt`.
 *   - TTL at SESSION_BINDING_TTL_MS (30 days). A stale entry is evicted
 *     on read and `get` returns null.
 *   - Every read revalidates the stored shape with Zod; a record that no
 *     longer parses is dropped silently (forward-compatible upgrade path).
 *   - Writes are atomic at the full-object granularity: load-mutate-save.
 *
 * Graceful degradation: if `chrome.storage.local` is not available in
 * the current context (e.g. unit tests that forgot to install a fake),
 * the store returns null on reads and no-ops on writes. This keeps the
 * sidepanel renderable even in degraded environments.
 */

import { z } from 'zod';
import type { Logger } from '../log';
import type { AgentId } from '../agents';
import { isAgentId } from '../agents';

export const SESSION_BINDING_STORAGE_KEY = 'llmc.session-binding.v1';
export const SESSION_BINDING_LRU_CAP = 200;
export const SESSION_BINDING_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export const SessionBindingSchema = z
  .object({
    sessionId: z.string().min(1).max(128),
    generationId: z.string().min(1).max(128),
    agentId: z.string().min(1).max(64),
    urlKey: z.string().min(1).max(2048),
    pageTitle: z.string().max(500).nullable(),
    createdAt: z.number().int().nonnegative(),
    updatedAt: z.number().int().nonnegative(),
  })
  .strict();

export type SessionBinding = Readonly<z.infer<typeof SessionBindingSchema>> & {
  readonly agentId: AgentId;
};

export interface SessionBindingStore {
  get(urlKey: string, agentId: AgentId): Promise<SessionBinding | null>;
  put(binding: SessionBinding): Promise<void>;
  evict(urlKey: string, agentId: AgentId): Promise<void>;
  list(): Promise<readonly SessionBinding[]>;
}

export interface SessionBindingStorageFacade {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

export interface SessionBindingStoreDeps {
  readonly storage: SessionBindingStorageFacade | null;
  readonly logger: Logger;
  readonly now: () => number;
}

function composeKey(urlKey: string, agentId: AgentId): string {
  return `${urlKey}|${agentId}`;
}

function parseRecord(
  raw: unknown,
): Record<string, SessionBinding> {
  if (raw === null || typeof raw !== 'object') return {};
  const out: Record<string, SessionBinding> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
    const parsed = SessionBindingSchema.safeParse(v);
    if (!parsed.success) continue;
    if (!isAgentId(parsed.data.agentId)) continue;
    out[k] = { ...parsed.data, agentId: parsed.data.agentId };
  }
  return out;
}

function getChromeStorageFacade(): SessionBindingStorageFacade | null {
  const g = globalThis as unknown as {
    chrome?: {
      storage?: {
        local?: {
          get: (k: string | null) => Promise<Record<string, unknown>>;
          set: (items: Record<string, unknown>) => Promise<void>;
        };
      };
    };
  };
  const local = g.chrome?.storage?.local;
  if (!local) return null;
  return {
    get: (k: string) => local.get(k),
    set: (items: Record<string, unknown>) => local.set(items),
  };
}

export function createSessionBindingStore(
  deps?: Partial<SessionBindingStoreDeps>,
): SessionBindingStore {
  const logger: Logger = deps?.logger ?? {
    debug: () => undefined,
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
  };
  const now = deps?.now ?? ((): number => Date.now());
  const storageOverride = deps?.storage;

  function resolveStorage(): SessionBindingStorageFacade | null {
    if (storageOverride !== undefined) return storageOverride;
    return getChromeStorageFacade();
  }

  async function loadAll(): Promise<Record<string, SessionBinding>> {
    const storage = resolveStorage();
    if (storage === null) return {};
    try {
      const raw = await storage.get(SESSION_BINDING_STORAGE_KEY);
      return parseRecord(raw[SESSION_BINDING_STORAGE_KEY]);
    } catch (err: unknown) {
      logger.warn('session-binding-store: load failed', {
        error: err instanceof Error ? err.message : String(err),
      });
      return {};
    }
  }

  async function saveAll(
    record: Record<string, SessionBinding>,
  ): Promise<void> {
    const storage = resolveStorage();
    if (storage === null) return;
    try {
      await storage.set({ [SESSION_BINDING_STORAGE_KEY]: record });
    } catch (err: unknown) {
      logger.warn('session-binding-store: save failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  function pruneStale(
    record: Record<string, SessionBinding>,
    reference: number,
  ): Record<string, SessionBinding> {
    const next: Record<string, SessionBinding> = {};
    for (const [k, v] of Object.entries(record)) {
      if (reference - v.updatedAt < SESSION_BINDING_TTL_MS) {
        next[k] = v;
      }
    }
    return next;
  }

  function enforceCap(
    record: Record<string, SessionBinding>,
  ): Record<string, SessionBinding> {
    const entries = Object.entries(record);
    if (entries.length <= SESSION_BINDING_LRU_CAP) return record;
    entries.sort((a, b) => b[1].updatedAt - a[1].updatedAt);
    const trimmed = entries.slice(0, SESSION_BINDING_LRU_CAP);
    const next: Record<string, SessionBinding> = {};
    for (const [k, v] of trimmed) next[k] = v;
    return next;
  }

  return {
    async get(urlKey: string, agentId: AgentId): Promise<SessionBinding | null> {
      if (typeof urlKey !== 'string' || urlKey.length === 0) return null;
      if (!isAgentId(agentId)) return null;
      const key = composeKey(urlKey, agentId);
      const current = await loadAll();
      const reference = now();
      const pruned = pruneStale(current, reference);
      const changed = Object.keys(pruned).length !== Object.keys(current).length;
      if (changed) await saveAll(pruned);
      const hit = pruned[key];
      return hit ?? null;
    },
    async put(binding: SessionBinding): Promise<void> {
      const validated = SessionBindingSchema.safeParse(binding);
      if (!validated.success) {
        logger.warn('session-binding-store: rejecting invalid binding', {
          issues: validated.error.issues.length,
        });
        return;
      }
      if (!isAgentId(validated.data.agentId)) return;
      const key = composeKey(validated.data.urlKey, validated.data.agentId);
      const current = await loadAll();
      const reference = now();
      const pruned = pruneStale(current, reference);
      const next: Record<string, SessionBinding> = { ...pruned };
      next[key] = { ...validated.data, agentId: validated.data.agentId };
      const capped = enforceCap(next);
      await saveAll(capped);
    },
    async evict(urlKey: string, agentId: AgentId): Promise<void> {
      if (!isAgentId(agentId)) return;
      const key = composeKey(urlKey, agentId);
      const current = await loadAll();
      if (!(key in current)) return;
      const next: Record<string, SessionBinding> = { ...current };
      delete next[key];
      await saveAll(next);
    },
    async list(): Promise<readonly SessionBinding[]> {
      const current = await loadAll();
      const reference = now();
      const pruned = pruneStale(current, reference);
      return Object.values(pruned);
    },
  };
}
