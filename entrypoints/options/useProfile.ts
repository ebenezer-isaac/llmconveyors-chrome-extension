// SPDX-License-Identifier: MIT
/**
 * React hook that owns the options-page Profile state.
 *
 * On mount:
 *   1. sends `PROFILE_GET` to the background worker
 *   2. subscribes to `chrome.runtime.onMessage` so a push from the
 *      background (e.g. a sibling tab finished uploading a resume) refreshes
 *      the in-memory state without a manual reload
 *
 * The hook exposes:
 *   - `profile`: the current Profile, or `null` while loading / if absent
 *   - `loading`, `error`, `saveState`
 *   - `updateProfile(patch)`: optimistic UI update + PROFILE_UPDATE message
 *   - `uploadJsonResume(raw)`: PROFILE_UPLOAD_JSON_RESUME message
 *   - `clearProfile()`: send an explicit empty patch via PROFILE_UPDATE + clear
 *
 * All side-effects flow through the injected `runtime` dependency so tests
 * can supply a fake without touching `globalThis.chrome`.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Profile, DeepPartial } from '@/src/background/messaging/schemas/profile.schema';
import type {
  ProfileGetResponse,
  ProfileUpdateResponse,
  ProfileUploadJsonResumeResponse,
} from '@/src/background/messaging/schemas/profile-messages.schema';

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export interface UseProfileResult {
  readonly profile: Profile | null;
  readonly loading: boolean;
  readonly error: string | null;
  readonly saveState: SaveState;
  readonly updateProfile: (patch: DeepPartial<Profile>) => Promise<void>;
  readonly uploadJsonResume: (raw: unknown) => Promise<void>;
  readonly refresh: () => Promise<void>;
}

type MessageEnvelope = {
  readonly key?: string;
  readonly data?: unknown;
};

type RuntimeMessenger = {
  sendMessage(message: unknown): Promise<unknown>;
  onMessage: {
    addListener(listener: (msg: unknown) => void): void;
    removeListener(listener: (msg: unknown) => void): void;
  };
};

export interface UseProfileDeps {
  readonly runtime: RuntimeMessenger | null;
}

function getDefaultRuntime(): RuntimeMessenger | null {
  const g = globalThis as unknown as {
    chrome?: { runtime?: RuntimeMessenger };
    browser?: { runtime?: RuntimeMessenger };
  };
  return g.chrome?.runtime ?? g.browser?.runtime ?? null;
}

function isProfileGetResponse(x: unknown): x is ProfileGetResponse {
  if (x === null || typeof x !== 'object') return false;
  const r = x as Record<string, unknown>;
  return r.ok === true || r.ok === false;
}

export function useProfile(deps?: UseProfileDeps): UseProfileResult {
  const runtime = deps?.runtime ?? getDefaultRuntime();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const mountedRef = useRef<boolean>(true);

  const refresh = useCallback(async (): Promise<void> => {
    if (runtime === null) {
      if (mountedRef.current) setLoading(false);
      return;
    }
    try {
      const response = (await runtime.sendMessage({
        key: 'PROFILE_GET',
        data: {},
      })) as ProfileGetResponse | undefined;
      if (!mountedRef.current) return;
      if (!response || !isProfileGetResponse(response)) {
        setProfile(null);
        return;
      }
      if (response.ok) {
        setProfile(response.profile);
        setError(null);
      } else {
        setProfile(null);
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [runtime]);

  useEffect(() => {
    mountedRef.current = true;
    void refresh();

    function onMessage(msg: unknown): void {
      if (msg === null || typeof msg !== 'object') return;
      const env = msg as MessageEnvelope;
      if (env.key !== 'PROFILE_UPDATED') return;
      // Background may broadcast a fresh profile; re-read to stay canonical.
      void refresh();
    }
    runtime?.onMessage.addListener(onMessage);
    return () => {
      mountedRef.current = false;
      runtime?.onMessage.removeListener(onMessage);
    };
  }, [runtime, refresh]);

  const updateProfile = useCallback(
    async (patch: DeepPartial<Profile>): Promise<void> => {
      if (runtime === null) {
        setError('Extension runtime unavailable');
        return;
      }
      setSaveState('saving');
      setError(null);
      try {
        const response = (await runtime.sendMessage({
          key: 'PROFILE_UPDATE',
          data: { patch },
        })) as ProfileUpdateResponse | undefined;
        if (!mountedRef.current) return;
        if (!response) {
          setSaveState('error');
          setError('No response from background');
          return;
        }
        if (response.ok) {
          setSaveState('saved');
          await refresh();
          return;
        }
        setSaveState('error');
        setError(
          response.errors
            .map((e) => `${e.path || '(root)'}: ${e.message}`)
            .join('; '),
        );
      } catch (err) {
        if (!mountedRef.current) return;
        setSaveState('error');
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [runtime, refresh],
  );

  const uploadJsonResume = useCallback(
    async (raw: unknown): Promise<void> => {
      if (runtime === null) {
        setError('Extension runtime unavailable');
        return;
      }
      setSaveState('saving');
      setError(null);
      try {
        const response = (await runtime.sendMessage({
          key: 'PROFILE_UPLOAD_JSON_RESUME',
          data: { jsonResume: raw },
        })) as ProfileUploadJsonResumeResponse | undefined;
        if (!mountedRef.current) return;
        if (!response) {
          setSaveState('error');
          setError('No response from background');
          return;
        }
        if (response.ok) {
          setProfile(response.profile);
          setSaveState('saved');
          return;
        }
        setSaveState('error');
        setError(
          response.errors
            .map((e) => `${e.path || '(root)'}: ${e.message}`)
            .join('; '),
        );
      } catch (err) {
        if (!mountedRef.current) return;
        setSaveState('error');
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [runtime],
  );

  return {
    profile,
    loading,
    error,
    saveState,
    updateProfile,
    uploadJsonResume,
    refresh,
  };
}
