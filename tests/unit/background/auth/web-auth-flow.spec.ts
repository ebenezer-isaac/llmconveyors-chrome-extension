// SPDX-License-Identifier: MIT
import { describe, it, expect, vi } from 'vitest';
import {
  buildSignInUrl,
  classifyLaunchError,
  launchWebAuthFlow,
  type WebAuthFlowDeps,
} from '@/src/background/auth/web-auth-flow';
import {
  AuthCancelledError,
  AuthNetworkError,
  AuthProviderError,
} from '@/src/background/auth/errors';

function makeDeps(overrides: Partial<WebAuthFlowDeps> = {}): WebAuthFlowDeps {
  return {
    launchWebAuthFlow: vi
      .fn()
      .mockResolvedValue('https://a'.repeat(16) + '.chromiumapp.org/cb#ok=1'),
    getRedirectURL: vi.fn().mockReturnValue('https://ext.chromiumapp.org/'),
    ...overrides,
  };
}

describe('buildSignInUrl', () => {
  it('appends the redirect URI as a query param', () => {
    const url = buildSignInUrl(
      'https://llmconveyors.com/auth/extension-signin',
      'https://ext.chromiumapp.org/',
    );
    const parsed = new URL(url);
    expect(parsed.searchParams.get('redirect')).toBe('https://ext.chromiumapp.org/');
  });

  it('throws AuthProviderError on an invalid bridge URL', () => {
    expect(() => buildSignInUrl('not a url', 'https://x/')).toThrow(
      AuthProviderError,
    );
  });
});

describe('classifyLaunchError', () => {
  it('maps "user did not approve" to AuthCancelledError', () => {
    const err = classifyLaunchError(new Error('The user did not approve access.'));
    expect(err).toBeInstanceOf(AuthCancelledError);
  });

  it('maps "user closed" to AuthCancelledError', () => {
    const err = classifyLaunchError(new Error('The user closed the window.'));
    expect(err).toBeInstanceOf(AuthCancelledError);
  });

  it('maps "could not be loaded" to AuthNetworkError', () => {
    const err = classifyLaunchError(
      new Error('Authorization page could not be loaded.'),
    );
    expect(err).toBeInstanceOf(AuthNetworkError);
  });

  it('maps "net::ERR_..." to AuthNetworkError', () => {
    const err = classifyLaunchError(new Error('net::ERR_CONNECTION_REFUSED'));
    expect(err).toBeInstanceOf(AuthNetworkError);
  });

  it('falls back to AuthProviderError for unknown wording', () => {
    const err = classifyLaunchError(new Error('some other error'));
    expect(err).toBeInstanceOf(AuthProviderError);
  });

  it('handles non-Error throwables', () => {
    const err = classifyLaunchError('string rejection');
    expect(err).toBeInstanceOf(AuthProviderError);
    expect(err.message).toBe('string rejection');
  });
});

describe('launchWebAuthFlow', () => {
  it('returns the redirect URL on success', async () => {
    const deps = makeDeps();
    const result = await launchWebAuthFlow('https://bridge.example/', deps);
    expect(result).toMatch(/chromiumapp\.org/);
    expect(deps.launchWebAuthFlow).toHaveBeenCalledOnce();
  });

  it('throws AuthProviderError when getRedirectURL returns empty', async () => {
    const deps = makeDeps({ getRedirectURL: vi.fn().mockReturnValue('') });
    await expect(launchWebAuthFlow('https://bridge/', deps)).rejects.toThrow(
      AuthProviderError,
    );
  });

  it('throws AuthNetworkError when launchWebAuthFlow returns undefined', async () => {
    const deps = makeDeps({
      launchWebAuthFlow: vi.fn().mockResolvedValue(undefined),
    });
    await expect(launchWebAuthFlow('https://bridge/', deps)).rejects.toThrow(
      AuthNetworkError,
    );
  });

  it('classifies cancel rejections', async () => {
    const deps = makeDeps({
      launchWebAuthFlow: vi
        .fn()
        .mockRejectedValue(new Error('The user did not approve access.')),
    });
    await expect(launchWebAuthFlow('https://bridge/', deps)).rejects.toThrow(
      AuthCancelledError,
    );
  });

  it('classifies network rejections', async () => {
    const deps = makeDeps({
      launchWebAuthFlow: vi
        .fn()
        .mockRejectedValue(new Error('Authorization page could not be loaded.')),
    });
    await expect(launchWebAuthFlow('https://bridge/', deps)).rejects.toThrow(
      AuthNetworkError,
    );
  });
});
