// SPDX-License-Identifier: MIT
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildStoredSession,
  createSignInOrchestrator,
  __resetSignInMutex,
  type SignInOrchestratorDeps,
  type StorageFacade,
  type AuthBroadcast,
} from '@/src/background/auth/sign-in-orchestrator';
import {
  AuthMalformedResponseError,
  AuthStorageError,
} from '@/src/background/auth/errors';
import type { StoredSession } from '@/src/background/messaging/schemas/auth.schema';

const VALID_HOST = 'abcdefghijklmnopabcdefghijklmnop';
const FIXED_NOW = 1_700_000_000_000;
const FUTURE_EXP = FIXED_NOW + 30 * 60 * 1000;

function b64url(input: string): string {
  return Buffer.from(input, 'utf-8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function buildJwt(userId: string): string {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify({ sub: userId, iat: FIXED_NOW }));
  // Pad the signature to make the token >= MIN_TOKEN_LENGTH (20 chars).
  return `${header}.${body}.signature_padding_xxxxxxxxxxxxxxx`;
}

function buildRedirect(overrides: {
  at?: string;
  rt?: string;
  ft?: string;
  exp?: number;
  userId?: string;
} = {}): string {
  const userId = overrides.userId ?? 'user_test_001';
  const at = overrides.at ?? buildJwt(userId);
  const rt = overrides.rt ?? 'rt_longrefreshtokenvalueaaaaaaaaaaaaaaa';
  const ft = overrides.ft ?? 'ft_longfingerprinttokenvaluebbbbbbbbbbb';
  const exp = overrides.exp ?? FUTURE_EXP;
  return `https://${VALID_HOST}.chromiumapp.org/cb#at=${encodeURIComponent(at)}&rt=${encodeURIComponent(rt)}&ft=${encodeURIComponent(ft)}&exp=${exp}`;
}

function makeStorage(): StorageFacade & { readonly reads: StoredSession[]; readonly writes: StoredSession[] } {
  const writes: StoredSession[] = [];
  const reads: StoredSession[] = [];
  return {
    writes,
    reads,
    writeSession: vi.fn(async (s: StoredSession) => {
      writes.push(s);
    }),
    readSession: vi.fn(async () => {
      const last = writes.at(-1) ?? null;
      if (last !== null) reads.push(last);
      return last;
    }),
  };
}

function makeBroadcast(): AuthBroadcast & { readonly sent: unknown[] } {
  const sent: unknown[] = [];
  return {
    sent,
    sendRuntime: vi.fn(async (msg: { readonly key: string; readonly data: unknown }) => {
      sent.push(msg);
    }),
  };
}

function makeDeps(overrides: Partial<SignInOrchestratorDeps> = {}): SignInOrchestratorDeps {
  const storage = overrides.storage ?? makeStorage();
  const broadcast = overrides.broadcast ?? makeBroadcast();
  return {
    webAuthFlow: {
      launchWebAuthFlow: vi.fn(),
      getRedirectURL: vi.fn().mockReturnValue(
        `https://${VALID_HOST}.chromiumapp.org/`,
      ),
    },
    storage,
    broadcast,
    parseDeps: { now: () => FIXED_NOW },
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    now: () => FIXED_NOW,
    bridgeUrl: 'https://llmconveyors.com/en/auth/extension-signin',
    launch: vi.fn().mockResolvedValue(buildRedirect()),
    ...overrides,
  };
}

beforeEach(() => {
  __resetSignInMutex();
});

describe('buildStoredSession', () => {
  it('extracts userId from the JWT and returns the correct StoredSession shape', () => {
    const parsed = {
      accessToken: buildJwt('user_xyz'),
      refreshToken: 'rt_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      fingerprintToken: 'ft_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      expiresAt: FUTURE_EXP,
    };
    const session = buildStoredSession(parsed);
    expect(session).toEqual({
      accessToken: parsed.accessToken,
      refreshToken: parsed.refreshToken,
      expiresAt: FUTURE_EXP,
      userId: 'user_xyz',
    });
  });

  it('propagates JWT-decode errors when the access token is malformed', () => {
    const parsed = {
      accessToken: 'not.a.realjwt.xxxxxxxxxxxxxxxxxxxxxxx',
      refreshToken: 'rt_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      fingerprintToken: 'ft_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      expiresAt: FUTURE_EXP,
    };
    expect(() => buildStoredSession(parsed)).toThrow(AuthMalformedResponseError);
  });
});

describe('createSignInOrchestrator', () => {
  it('happy path: launches, parses, persists, broadcasts, returns authed state', async () => {
    const storage = makeStorage();
    const broadcast = makeBroadcast();
    const deps = makeDeps({ storage, broadcast });
    const signIn = createSignInOrchestrator(deps);
    const state = await signIn();
    expect(state).toEqual({ signedIn: true, userId: 'user_test_001' });
    expect(deps.launch).toHaveBeenCalledOnce();
    expect(storage.writes).toHaveLength(1);
    expect(storage.writes[0]?.userId).toBe('user_test_001');
    expect(broadcast.sent).toHaveLength(1);
    expect(broadcast.sent[0]).toMatchObject({
      key: 'AUTH_STATE_CHANGED',
      data: { signedIn: true, userId: 'user_test_001' },
    });
  });

  it('concurrent calls share a single in-flight promise', async () => {
    const storage = makeStorage();
    const broadcast = makeBroadcast();
    const launch = vi.fn().mockResolvedValue(buildRedirect());
    const deps = makeDeps({ storage, broadcast, launch });
    const signIn = createSignInOrchestrator(deps);
    const [a, b] = await Promise.all([signIn(), signIn()]);
    expect(a).toEqual(b);
    expect(launch).toHaveBeenCalledOnce();
    expect(storage.writes).toHaveLength(1);
  });

  it('re-entry after a failed call succeeds', async () => {
    const storage = makeStorage();
    const launch = vi
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(buildRedirect());
    const deps = makeDeps({ storage, launch });
    const signIn = createSignInOrchestrator(deps);
    await expect(signIn()).rejects.toThrow();
    const second = await signIn();
    expect(second).toEqual({ signedIn: true, userId: 'user_test_001' });
  });

  it('propagates AuthMalformedResponseError on a bad redirect', async () => {
    const deps = makeDeps({
      launch: vi.fn().mockResolvedValue(
        `https://${VALID_HOST}.chromiumapp.org/cb#garbage`,
      ),
    });
    const signIn = createSignInOrchestrator(deps);
    await expect(signIn()).rejects.toThrow(AuthMalformedResponseError);
  });

  it('rejects with AuthStorageError when writeSession throws', async () => {
    const storage = makeStorage();
    storage.writeSession = vi.fn(async () => {
      throw new Error('quota exceeded');
    });
    const deps = makeDeps({ storage });
    const signIn = createSignInOrchestrator(deps);
    await expect(signIn()).rejects.toThrow(AuthStorageError);
  });

  it('rejects with AuthStorageError when read-back shows a mismatch', async () => {
    const storage = makeStorage();
    storage.writeSession = vi.fn(async () => undefined);
    storage.readSession = vi.fn(async () => null);
    const deps = makeDeps({ storage });
    const signIn = createSignInOrchestrator(deps);
    await expect(signIn()).rejects.toThrow(AuthStorageError);
  });

  it('does not roll back a successful sign-in when broadcast throws', async () => {
    const storage = makeStorage();
    const broadcast: AuthBroadcast = {
      sendRuntime: vi.fn(async () => {
        throw new Error('no listener');
      }),
    };
    const deps = makeDeps({ storage, broadcast });
    const signIn = createSignInOrchestrator(deps);
    const state = await signIn();
    expect(state).toEqual({ signedIn: true, userId: 'user_test_001' });
    expect(storage.writes).toHaveLength(1);
  });

  it('wraps non-AuthError throws from parseFragment in AuthMalformedResponseError', async () => {
    // Launch returns a URL that is technically valid but our parser will
    // reject; this also covers the "parser throws unknown" defensive branch
    // when launch yields something the parser does not expect.
    const deps = makeDeps({
      launch: vi.fn().mockResolvedValue('https://evil.example.com/cb#at=x'),
    });
    const signIn = createSignInOrchestrator(deps);
    await expect(signIn()).rejects.toThrow(AuthMalformedResponseError);
  });
});
