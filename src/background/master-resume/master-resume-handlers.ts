// SPDX-License-Identifier: MIT
/**
 * MASTER_RESUME_GET / MASTER_RESUME_PUT handlers.
 *
 * The popup, side panel, and content-script autofill pipeline call these
 * through the shared runtime messaging surface. The handlers compose the
 * typed master-resume client + cache and turn its outcomes into the typed
 * envelope the protocol ships on the wire.
 */

import type { Logger } from '../log';
import type {
  MasterResumeGetOutcome,
  MasterResumePutOutcome,
} from './master-resume-client';
import type {
  MasterResumeResponse,
  MasterResumeUpsert,
} from './master-resume-schema';

export type MasterResumeGetRequest = Record<string, never>;

export type MasterResumeGetResponse =
  | { readonly ok: true; readonly resume: MasterResumeResponse | null }
  | {
      readonly ok: false;
      readonly reason:
        | 'unauthenticated'
        | 'network-error'
        | 'shape-mismatch'
        | 'api-error';
      readonly status?: number;
    };

export type MasterResumePutRequest = MasterResumeUpsert;

export type MasterResumePutResponse =
  | { readonly ok: true; readonly resume: MasterResumeResponse }
  | {
      readonly ok: false;
      readonly reason:
        | 'unauthenticated'
        | 'network-error'
        | 'validation-error'
        | 'shape-mismatch'
        | 'api-error';
      readonly status?: number;
      readonly issues?: readonly string[];
    };

export interface MasterResumeHandlerDeps {
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
  readonly logger: Logger;
  readonly broadcastUnauthenticated: () => Promise<void>;
}

export function createMasterResumeHandlers(deps: MasterResumeHandlerDeps): {
  MASTER_RESUME_GET: (msg: { readonly data: MasterResumeGetRequest }) => Promise<MasterResumeGetResponse>;
  MASTER_RESUME_PUT: (msg: { readonly data: MasterResumePutRequest }) => Promise<MasterResumePutResponse>;
} {
  return {
    async MASTER_RESUME_GET(): Promise<MasterResumeGetResponse> {
      const cached = await deps.cache.read();
      if (cached) {
        return { ok: true, resume: cached.response };
      }
      const outcome = await deps.client.get();
      switch (outcome.kind) {
        case 'ok': {
          await deps.cache.write(outcome.resume);
          return { ok: true, resume: outcome.resume };
        }
        case 'not-found': {
          await deps.cache.clear();
          return { ok: true, resume: null };
        }
        case 'unauthenticated': {
          await deps.cache.clear();
          await deps.broadcastUnauthenticated();
          return { ok: false, reason: 'unauthenticated' };
        }
        case 'shape-mismatch': {
          // If we have a stale cache entry, fall back to it so the user
          // doesn't lose the ability to autofill on a transient shape
          // drift. Otherwise surface the error.
          const stale = await deps.cache.readStale();
          if (stale) {
            deps.logger.warn('master-resume: falling back to stale cache on shape drift');
            return { ok: true, resume: stale.response };
          }
          return { ok: false, reason: 'shape-mismatch' };
        }
        case 'network-error': {
          const stale = await deps.cache.readStale();
          if (stale) {
            deps.logger.info('master-resume: network error, serving stale cache');
            return { ok: true, resume: stale.response };
          }
          return { ok: false, reason: 'network-error' };
        }
        case 'api-error':
          return { ok: false, reason: 'api-error', status: outcome.status };
      }
    },

    async MASTER_RESUME_PUT(msg: {
      readonly data: MasterResumePutRequest;
    }): Promise<MasterResumePutResponse> {
      const outcome = await deps.client.put(msg.data);
      switch (outcome.kind) {
        case 'ok': {
          await deps.cache.write(outcome.resume);
          return { ok: true, resume: outcome.resume };
        }
        case 'unauthenticated': {
          await deps.cache.clear();
          await deps.broadcastUnauthenticated();
          return { ok: false, reason: 'unauthenticated' };
        }
        case 'validation-error':
          return {
            ok: false,
            reason: 'validation-error',
            issues: outcome.issues,
          };
        case 'shape-mismatch':
          return { ok: false, reason: 'shape-mismatch' };
        case 'network-error':
          return { ok: false, reason: 'network-error' };
        case 'api-error':
          return { ok: false, reason: 'api-error', status: outcome.status };
      }
    },
  };
}
