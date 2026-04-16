// SPDX-License-Identifier: MIT
import { beforeEach, afterEach, describe, it, expect } from 'vitest';
import { createFakeChrome, seedStorage, readStorage } from './_lib/fake-chrome';
import { createMockBackend, type MockBackend } from './_lib/mock-backend';
import { initSessionManager, __resetSessionManager } from '@/src/background/session/session-manager';
import { readSession, writeSession, clearSession } from '@/src/background/storage/session-storage';
import { createLogger } from '@/src/background/log';

/**
 * Protocol round-trip integration tests against the real handlers.
 *
 * Post 101.2: the PROFILE round-trip suite was removed when local profile
 * storage was replaced by the backend master-resume. The master-resume
 * round-trip lives alongside the master-resume module (commit 101.3).
 */

const BACKEND_URL = 'https://api.llmconveyors.local';

const REGISTER_HANDLERS_MODULE: string =
  '../../src/background/messaging/register-handlers';

interface RegisterHandlersModule {
  readonly registerHandlers: (customDeps?: unknown) => unknown;
  readonly __resetRegistration: () => void;
}

function ensureSessionManager(): void {
  __resetSessionManager();
  initSessionManager({
    readSession,
    writeSession,
    clearSession,
    fetch: globalThis.fetch.bind(globalThis),
    now: () => Date.now(),
    logger: createLogger('test.session'),
    refreshEndpoint: `${BACKEND_URL}/api/v1/auth/session/refresh`,
  });
}

async function freshRegister(): Promise<void> {
  ensureSessionManager();
  const mod = (await import(REGISTER_HANDLERS_MODULE)) as RegisterHandlersModule;
  mod.__resetRegistration();
  mod.registerHandlers({
    endpoints: {
      authExchange: `${BACKEND_URL}/api/v1/auth/extension-token-exchange`,
      authSignOut: `${BACKEND_URL}/api/v1/auth/sign-out`,
      extractSkills: `${BACKEND_URL}/api/v1/ats/extract-skills`,
      settingsProfile: `${BACKEND_URL}/api/v1/settings/profile`,
      generationStart: `${BACKEND_URL}/api/v1/agents/generate`,
      generationCancel: `${BACKEND_URL}/api/v1/agents/cancel`,
    },
  });
}

describe('AUTH round-trip', () => {
  let fake: ReturnType<typeof createFakeChrome>;
  let backend: MockBackend;

  beforeEach(async () => {
    fake = createFakeChrome();
    backend = createMockBackend();
    backend.mount(BACKEND_URL);
    await freshRegister();
  });

  afterEach(() => {
    backend.unmount();
  });

  it('AUTH_SIGN_IN stores session and broadcasts AUTH_STATE_CHANGED', async () => {
    backend.route('POST', '/api/v1/auth/extension-token-exchange', {
      status: 200,
      body: {
        accessToken: 'at_test_001',
        refreshToken: 'rt_test_001',
        expiresAt: 1_713_003_600_000,
        userId: 'user_test_001',
      },
    });
    let broadcastPayload: unknown = null;
    fake.runtime.onMessage.addListener((msg: unknown) => {
      const typed = msg as { key?: string; data?: unknown };
      if (typed.key === 'AUTH_STATE_CHANGED') broadcastPayload = typed.data;
      return undefined;
    });
    const response = await fake.runtime.sendMessage({
      key: 'AUTH_SIGN_IN',
      data: { cookieJar: 'st-auth-session=abc123' },
    });
    expect(response).toMatchObject({ ok: true, userId: 'user_test_001' });
    const stored = await readStorage<{ accessToken: string }>('llmc.session.v1');
    expect(stored?.accessToken).toBe('at_test_001');
    expect(broadcastPayload).toMatchObject({ signedIn: true, userId: 'user_test_001' });
  });

  it('AUTH_SIGN_OUT clears session and broadcasts signed-out state', async () => {
    await seedStorage('llmc.session.v1', {
      accessToken: 'at_test_001',
      refreshToken: 'rt_test_001',
      expiresAt: 1_713_003_600_000,
      userId: 'user_test_001',
    });
    let broadcastPayload: unknown = null;
    fake.runtime.onMessage.addListener((msg: unknown) => {
      const typed = msg as { key?: string; data?: unknown };
      if (typed.key === 'AUTH_STATE_CHANGED') broadcastPayload = typed.data;
      return undefined;
    });
    backend.route('POST', '/api/v1/auth/sign-out', { status: 204, body: {} });
    const response = await fake.runtime.sendMessage({ key: 'AUTH_SIGN_OUT', data: {} });
    expect(response).toMatchObject({ ok: true });
    const stored = await readStorage('llmc.session.v1');
    expect(stored).toBeUndefined();
    expect(broadcastPayload).toMatchObject({ signedIn: false });
  });

  it('AUTH_STATUS returns stored session when present and null when absent', async () => {
    const absent = await fake.runtime.sendMessage({ key: 'AUTH_STATUS', data: {} });
    expect(absent).toMatchObject({ signedIn: false });
    await seedStorage('llmc.session.v1', {
      accessToken: 'at_test_001',
      refreshToken: 'rt_test_001',
      expiresAt: 1_713_003_600_000,
      userId: 'user_test_001',
    });
    const present = await fake.runtime.sendMessage({ key: 'AUTH_STATUS', data: {} });
    expect(present).toMatchObject({ signedIn: true, userId: 'user_test_001' });
  });
});

describe('FILL round-trip', () => {
  let fake: ReturnType<typeof createFakeChrome>;

  beforeEach(async () => {
    fake = createFakeChrome();
    await seedStorage('llmc.session.v1', {
      accessToken: 'at_test_001',
      refreshToken: 'rt_test_001',
      expiresAt: 1_713_003_600_000,
      userId: 'user_test_001',
    });
    await freshRegister();
  });

  it('FILL_REQUEST forwards to content-script and returns aggregated FillPlanResult', async () => {
    const stubTabsSendMessage = async (
      _tabId: number,
      msg: unknown,
    ): Promise<unknown> => {
      const typed = msg as { key?: string };
      if (typed.key !== 'FILL_REQUEST') {
        throw new Error(`unexpected message to content: ${String(typed.key)}`);
      }
      return {
        ok: true,
        planId: 'plan_test_001',
        executedAt: new Date().toISOString(),
        filled: [
          { ok: true, selector: '#first_name', value: 'Jane', fieldType: 'first-name' },
          { ok: true, selector: '#last_name', value: 'Doe', fieldType: 'last-name' },
          { ok: true, selector: '#email', value: 'jane.doe@example.com', fieldType: 'email' },
        ],
        skipped: [],
        failed: [],
        aborted: false,
      };
    };
    fake.tabs.sendMessage = stubTabsSendMessage as unknown as typeof fake.tabs.sendMessage;
    const response = await fake.runtime.sendMessage({
      key: 'FILL_REQUEST',
      data: { tabId: 1, url: 'https://boards.greenhouse.io/airbnb/jobs/1234' },
    });
    expect(response).toMatchObject({ ok: true });
    expect((response as { filled: readonly unknown[] }).filled).toHaveLength(3);
  });

  it('FILL_REQUEST returns content-script-not-loaded when the content worker is absent', async () => {
    const stubTabsSendMessage = async (): Promise<unknown> => {
      throw new Error('no listener');
    };
    fake.tabs.sendMessage = stubTabsSendMessage as unknown as typeof fake.tabs.sendMessage;
    const response = await fake.runtime.sendMessage({
      key: 'FILL_REQUEST',
      data: { tabId: 1, url: 'https://boards.greenhouse.io/airbnb/jobs/1234' },
    });
    expect(response).toMatchObject({
      ok: false,
      aborted: true,
      abortReason: 'content-script-not-loaded',
    });
  });
});
