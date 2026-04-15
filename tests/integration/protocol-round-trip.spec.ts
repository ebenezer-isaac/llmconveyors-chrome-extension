// SPDX-License-Identifier: MIT
import { beforeEach, afterEach, describe, it, expect } from 'vitest';
import { createFakeChrome, seedStorage, readStorage } from './_lib/fake-chrome';
import {
  CANONICAL_PROFILE,
  cloneProfile,
  PROFILE_STORAGE_KEY,
  type CanonicalProfile,
} from './_lib/canonical-profile';
import { createMockBackend, type MockBackend } from './_lib/mock-backend';

/**
 * Protocol round-trip integration tests. Every scenario is fully written
 * against the real ProtocolMap handlers A5 ships. Each suite is wrapped in
 * `describe.skip` until the owning phase lands real handlers; at that point
 * the phase's acceptance criteria REMOVE the `.skip` suffix.
 *
 * Owner -> unskip phase mapping:
 *   AUTH round-trip     -> A5 registers handlers, A6 wires real SuperTokens
 *   PROFILE round-trip  -> A5 registers handlers, A7 ships Profile storage
 *   FILL round-trip     -> A5 forwards to content, A8 executes fill
 */

const BACKEND_URL = 'https://api.llmconveyors.local';

/**
 * Module specifier for the A5 handler registration entry point. Stored in a
 * variable so the dynamic `import()` expression is typed as `Promise<unknown>`
 * and does not require the module to exist at typecheck time. This lets the
 * harness ship BEFORE A5 lands the implementation; the `.skip` guard keeps
 * these bodies unreachable at runtime until the owner phase unskips them.
 */
const REGISTER_HANDLERS_MODULE: string =
  '../../src/background/messaging/register-handlers';

describe.skip('AUTH round-trip', () => {
  let fake: ReturnType<typeof createFakeChrome>;
  let backend: MockBackend;

  beforeEach(async () => {
    fake = createFakeChrome();
    backend = createMockBackend();
    backend.mount(BACKEND_URL);
    // Import A5 handlers AFTER fake-browser is mounted; they register against fakeBrowser.runtime.onMessage.
    await import(REGISTER_HANDLERS_MODULE);
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

describe.skip('PROFILE round-trip', () => {
  let fake: ReturnType<typeof createFakeChrome>;

  beforeEach(async () => {
    fake = createFakeChrome();
    await import(REGISTER_HANDLERS_MODULE);
  });

  it('PROFILE_GET returns canonical profile when seeded', async () => {
    await seedStorage(PROFILE_STORAGE_KEY, CANONICAL_PROFILE);
    const response = await fake.runtime.sendMessage({ key: 'PROFILE_GET', data: {} });
    expect(response).toMatchObject({
      ok: true,
      profile: {
        profileVersion: '1.0',
        basics: { firstName: 'Jane', lastName: 'Doe', email: 'jane.doe@example.com' },
      },
    });
  });

  it('PROFILE_UPDATE merges patch and bumps updatedAtMs', async () => {
    await seedStorage(PROFILE_STORAGE_KEY, cloneProfile());
    const before = Date.now();
    const response = await fake.runtime.sendMessage({
      key: 'PROFILE_UPDATE',
      data: { patch: { basics: { phone: '+1-415-555-9999' } } },
    });
    expect(response).toMatchObject({ ok: true });
    const stored = await readStorage<CanonicalProfile>(PROFILE_STORAGE_KEY);
    expect(stored?.basics.phone).toBe('+1-415-555-9999');
    expect(stored?.basics.firstName).toBe('Jane');
    expect(stored?.updatedAtMs ?? 0).toBeGreaterThanOrEqual(before);
  });

  it('PROFILE_UPLOAD_JSON_RESUME parses and stores the converted profile', async () => {
    const jsonResume = {
      basics: { name: 'New User', email: 'new@example.com' },
      work: [{ company: 'Test Co', position: 'Engineer' }],
    };
    const response = await fake.runtime.sendMessage({
      key: 'PROFILE_UPLOAD_JSON_RESUME',
      data: { jsonResume },
    });
    expect(response).toMatchObject({ ok: true });
    const stored = await readStorage<CanonicalProfile>(PROFILE_STORAGE_KEY);
    expect(stored?.basics.email).toBe('new@example.com');
    expect(stored?.work?.[0]?.company).toBe('Test Co');
    expect(stored?.profileVersion).toBe('1.0');
  });
});

describe.skip('FILL round-trip', () => {
  let fake: ReturnType<typeof createFakeChrome>;

  beforeEach(async () => {
    fake = createFakeChrome();
    await seedStorage(PROFILE_STORAGE_KEY, CANONICAL_PROFILE);
    await seedStorage('llmc.session.v1', {
      accessToken: 'at_test_001',
      refreshToken: 'rt_test_001',
      expiresAt: 1_713_003_600_000,
      userId: 'user_test_001',
    });
    await import(REGISTER_HANDLERS_MODULE);
  });

  it('FILL_REQUEST forwards to content-script and returns aggregated FillPlanResult', async () => {
    // Simulate content-script handler by registering a listener on the fake-browser
    // tabs.sendMessage call. A5 forwards FILL_REQUEST to the active tab; we stub
    // the content side with a success result matching the canonical profile.
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

  it('FILL_REQUEST returns aborted result when profile missing', async () => {
    await fake.storage.local.remove(PROFILE_STORAGE_KEY);
    const response = await fake.runtime.sendMessage({
      key: 'FILL_REQUEST',
      data: { tabId: 1, url: 'https://boards.greenhouse.io/airbnb/jobs/1234' },
    });
    expect(response).toMatchObject({
      ok: false,
      aborted: true,
      abortReason: 'profile-missing',
    });
  });
});
