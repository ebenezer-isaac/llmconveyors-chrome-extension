import { describe, it, expect, vi, beforeEach } from 'vitest';
import { clientEnv } from '../../../../src/shared/env';
import { registerHandlers } from '../../../../src/background/messaging/handlers';

describe('graceful web-login fallback (handlers.ts)', () => {
  let deps: any;

  beforeEach(() => {
    // 1. Reset all mocks and global stub bindings
    vi.clearAllMocks();
    
    // 2. We explicitly stub the global browser/chrome API namespace
    globalThis.chrome = {
      tabs: {
        create: vi.fn(),
      },
      runtime: {
        lastError: undefined,
      },
      cookies: {
        get: vi.fn(),
        set: vi.fn(),
        remove: vi.fn(),
      },
    } as any;

    // 3. We create a mocked dependency injection payload for the handlers
    deps = {
      broadcast: {
        sendRuntime: vi.fn(), // Intercepts the AUTH_STATE_CHANGED event
      },
      fetch: vi.fn(), 
      tabState: {
        clearAll: vi.fn(),
      },
      logger: {
        info: vi.fn(),
        debug: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
      },
      sse: {
        abortGeneration: vi.fn(),
      }
    };
  });

  it('automatically opens the /login tab if native Chrome Auth strictly blocks the extension', async () => {
    // Mock the Google Identity API to simulate the "Sync off" environment constraint
    globalThis.chrome.identity = {
      getAuthToken: (_options: any, callback: (token?: string) => void) => {
        globalThis.chrome.runtime.lastError = { message: 'The user turned off browser signin' } as any;
        callback(undefined); 
      },
    } as any;

    // Execute the handler registrations, which bridges our mocks securely
    const handlers = registerHandlers(deps);
    
    // We execute the inbound message identical to clicking the popup UI
    const result = await handlers.AUTH_SIGN_IN({ interactive: true });

    // Assert: Execution fails gracefully with UserCancelledOrError
    expect(result.ok).toBe(false);
    expect(result).toHaveProperty('reason', 'UserCancelledOrError');

    // VERIFICATION: The extension did NOT abandon the user. It explicitly routed them.
    expect(globalThis.chrome.tabs.create).toHaveBeenCalledOnce();
    expect(globalThis.chrome.tabs.create).toHaveBeenCalledWith({
      url: `${clientEnv.webBaseUrl}/login`,
    });
    
    // VERIFICATION: The logger actively recorded the pivot.
    expect(deps.logger.warn).toHaveBeenCalledWith(
      'AUTH_SIGN_IN: native auth failed, routing to seamless web fallback',
      { reason: 'UserCancelledOrError' }
    );
  });
});
