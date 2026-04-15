// SPDX-License-Identifier: MIT
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useProfile } from '@/entrypoints/popup/useProfile';
import type { ClientProfileSnapshot } from '@/src/background/messaging/protocol-types';

interface FakeChrome {
  runtime: {
    sendMessage: (msg: unknown) => Promise<unknown>;
  };
}

function installFakeChrome(
  sendMessage: (msg: unknown) => Promise<unknown>,
): FakeChrome {
  const fake: FakeChrome = { runtime: { sendMessage } };
  (globalThis as unknown as { chrome: FakeChrome }).chrome = fake;
  return fake;
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let capture: { current: ReturnType<typeof useProfile> | null } = { current: null };

function Probe(): React.ReactElement {
  const value = useProfile();
  capture.current = value;
  return <div />;
}

beforeEach(() => {
  delete (globalThis as unknown as { chrome?: unknown }).chrome;
  container = document.createElement('div');
  document.body.appendChild(container);
  capture = { current: null };
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  container = null;
  root = null;
});

async function mount(): Promise<void> {
  await act(async () => {
    root = createRoot(container!);
    root.render(<Probe />);
  });
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('useProfile', () => {
  it('fetches profile on mount and exposes the populated fields', async () => {
    const profile: ClientProfileSnapshot = {
      email: 'alice@example.com',
      displayName: 'Alice Wong',
      photoURL: 'https://cdn.example.com/a.png',
    };
    const sendMessage = vi.fn(async (msg: unknown) => {
      const env = msg as { key?: string };
      if (env.key === 'PROFILE_GET') return profile;
      return undefined;
    });
    installFakeChrome(sendMessage);
    await mount();
    await flush();
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'PROFILE_GET' }),
    );
    expect(capture.current?.loading).toBe(false);
    expect(capture.current?.profile?.email).toBe('alice@example.com');
    expect(capture.current?.profile?.displayName).toBe('Alice Wong');
    expect(capture.current?.profile?.photoURL).toBe(
      'https://cdn.example.com/a.png',
    );
    expect(capture.current?.error).toBeNull();
  });

  it('accepts null fields (backend has not populated yet)', async () => {
    installFakeChrome(async () => ({
      email: null,
      displayName: null,
      photoURL: null,
    }));
    await mount();
    await flush();
    expect(capture.current?.profile).not.toBeNull();
    expect(capture.current?.profile?.email).toBeNull();
    expect(capture.current?.profile?.displayName).toBeNull();
    expect(capture.current?.profile?.photoURL).toBeNull();
    expect(capture.current?.error).toBeNull();
  });

  it('surfaces an error when sendMessage rejects', async () => {
    installFakeChrome(async () => {
      throw new Error('network down');
    });
    await mount();
    await flush();
    expect(capture.current?.loading).toBe(false);
    expect(capture.current?.profile).toBeNull();
    expect(capture.current?.error).toMatch(/network down/);
  });

  it('rejects malformed shapes with the invalid-response error', async () => {
    installFakeChrome(async () => ({ email: 42, displayName: null, photoURL: null }));
    await mount();
    await flush();
    expect(capture.current?.profile).toBeNull();
    expect(capture.current?.error).toMatch(/invalid/i);
  });

  it('refreshes on window focus events', async () => {
    let n = 0;
    const sendMessage = vi.fn(async (): Promise<ClientProfileSnapshot> => {
      n++;
      return {
        email: `u${n}@example.com`,
        displayName: null,
        photoURL: null,
      };
    });
    installFakeChrome(sendMessage);
    await mount();
    await flush();
    expect(capture.current?.profile?.email).toBe('u1@example.com');
    await act(async () => {
      globalThis.dispatchEvent(new Event('focus'));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(capture.current?.profile?.email).toBe('u2@example.com');
  });

  it('reports runtime unavailable error when chrome.runtime is missing', async () => {
    await mount();
    await flush();
    expect(capture.current?.loading).toBe(false);
    expect(capture.current?.error).toMatch(/runtime/i);
  });
});
