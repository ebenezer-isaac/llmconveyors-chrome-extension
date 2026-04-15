// SPDX-License-Identifier: MIT
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useProfile } from '@/entrypoints/options/useProfile';
import type { Profile } from '@/src/background/messaging/schemas/profile.schema';

type Listener = (msg: unknown) => void;

function makeProfile(over: Partial<Profile> = {}): Profile {
  return {
    profileVersion: '1.0',
    updatedAtMs: 1,
    basics: {
      firstName: 'A',
      lastName: 'B',
      email: 'a@b.com',
      phone: '',
      location: { city: '', region: '', countryCode: '', postalCode: '' },
      website: '',
      linkedin: '',
      github: '',
    },
    work: [],
    education: [],
    skills: [],
    ...over,
  };
}

function makeRuntime(
  responder: (msg: unknown) => Promise<unknown>,
): { runtime: { sendMessage: typeof responder; onMessage: { addListener: (f: Listener) => void; removeListener: (f: Listener) => void } }; listeners: Listener[] } {
  const listeners: Listener[] = [];
  const runtime = {
    sendMessage: vi.fn(responder),
    onMessage: {
      addListener: (fn: Listener) => {
        listeners.push(fn);
      },
      removeListener: (fn: Listener) => {
        const idx = listeners.indexOf(fn);
        if (idx !== -1) listeners.splice(idx, 1);
      },
    },
  };
  return { runtime, listeners };
}

interface HarnessCaptureProps {
  readonly capture: (value: ReturnType<typeof useProfile>) => void;
  readonly deps: Parameters<typeof useProfile>[0];
}

function Harness(props: HarnessCaptureProps): React.ReactElement {
  const result = useProfile(props.deps);
  props.capture(result);
  return <div data-testid="harness" />;
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  container = null;
  root = null;
});

async function mountHarness(deps: Parameters<typeof useProfile>[0]): Promise<{ current: () => ReturnType<typeof useProfile> }> {
  let captured: ReturnType<typeof useProfile> | null = null;
  const capture = (v: ReturnType<typeof useProfile>): void => {
    captured = v;
  };
  await act(async () => {
    root = createRoot(container!);
    root.render(<Harness capture={capture} deps={deps} />);
  });
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  return {
    current: () => {
      if (captured === null) throw new Error('harness not captured');
      return captured;
    },
  };
}

describe('useProfile', () => {
  it('loads a profile on mount via PROFILE_GET', async () => {
    const profile = makeProfile();
    const { runtime } = makeRuntime(async (msg) => {
      const typed = msg as { key?: string };
      if (typed.key === 'PROFILE_GET') return { ok: true, profile };
      return undefined;
    });
    const h = await mountHarness({ runtime });
    expect(h.current().profile).toEqual(profile);
    expect(h.current().loading).toBe(false);
  });

  it('returns null profile on not-found response', async () => {
    const { runtime } = makeRuntime(async (msg) => {
      const typed = msg as { key?: string };
      if (typed.key === 'PROFILE_GET') return { ok: false, reason: 'not-found' };
      return undefined;
    });
    const h = await mountHarness({ runtime });
    expect(h.current().profile).toBeNull();
  });

  it('updateProfile sends PROFILE_UPDATE and refreshes on success', async () => {
    const original = makeProfile();
    const updated = makeProfile({ basics: { ...original.basics, phone: '+1-000' } });
    let callNum = 0;
    const { runtime } = makeRuntime(async (msg) => {
      const typed = msg as { key?: string };
      if (typed.key === 'PROFILE_GET') {
        callNum += 1;
        return { ok: true, profile: callNum === 1 ? original : updated };
      }
      if (typed.key === 'PROFILE_UPDATE') return { ok: true };
      return undefined;
    });
    const h = await mountHarness({ runtime });
    await act(async () => {
      await h.current().updateProfile({ basics: { phone: '+1-000' } });
    });
    expect(h.current().profile?.basics.phone).toBe('+1-000');
    expect(h.current().saveState).toBe('saved');
  });

  it('surfaces PROFILE_UPDATE errors into saveState=error', async () => {
    const { runtime } = makeRuntime(async (msg) => {
      const typed = msg as { key?: string };
      if (typed.key === 'PROFILE_GET') return { ok: true, profile: makeProfile() };
      if (typed.key === 'PROFILE_UPDATE') {
        return { ok: false, errors: [{ path: 'basics.email', message: 'invalid' }] };
      }
      return undefined;
    });
    const h = await mountHarness({ runtime });
    await act(async () => {
      await h.current().updateProfile({ basics: { email: 'bad' } });
    });
    expect(h.current().saveState).toBe('error');
    expect(h.current().error).toContain('invalid');
  });

  it('uploadJsonResume calls PROFILE_UPLOAD_JSON_RESUME and sets profile on success', async () => {
    const profile = makeProfile();
    const { runtime } = makeRuntime(async (msg) => {
      const typed = msg as { key?: string };
      if (typed.key === 'PROFILE_GET') return { ok: false, reason: 'not-found' };
      if (typed.key === 'PROFILE_UPLOAD_JSON_RESUME') return { ok: true, profile };
      return undefined;
    });
    const h = await mountHarness({ runtime });
    await act(async () => {
      await h.current().uploadJsonResume({ basics: { name: 'A B', email: 'a@b.com' } });
    });
    expect(h.current().profile).toEqual(profile);
    expect(h.current().saveState).toBe('saved');
  });

  it('handles runtime === null (missing chrome) gracefully', async () => {
    const h = await mountHarness({ runtime: null });
    expect(h.current().profile).toBeNull();
    expect(h.current().loading).toBe(false);
  });
});
