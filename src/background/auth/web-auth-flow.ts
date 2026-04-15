// SPDX-License-Identifier: MIT
/**
 * Promise-based wrapper around `chrome.identity.launchWebAuthFlow`.
 *
 * The Chrome callback API is already promise-shaped in MV3 via `wxt/browser`,
 * but we wrap it here for three reasons:
 *   1. Centralize the URL construction with the dynamic redirect URI.
 *   2. Normalize the error surface: map Chrome's message wordings to the
 *      typed AuthError hierarchy (AuthCancelledError / AuthNetworkError /
 *      AuthProviderError).
 *   3. Inject `launchWebAuthFlow` and `getRedirectURL` for tests via the
 *      `WebAuthFlowDeps` interface (D20 dependency injection).
 *
 * Production callers receive a `string` (the final redirect URL) or a typed
 * AuthError rejection.
 */

import { browser } from 'wxt/browser';
import {
  AuthCancelledError,
  AuthError,
  AuthNetworkError,
  AuthProviderError,
} from './errors';

export interface WebAuthFlowDeps {
  readonly launchWebAuthFlow: (opts: {
    readonly url: string;
    readonly interactive: boolean;
  }) => Promise<string | undefined>;
  readonly getRedirectURL: () => string;
}

/**
 * Real wired deps for production. The `browser.identity` surface is typed
 * as a union across browsers; we narrow it at this single boundary.
 */
export const defaultWebAuthFlowDeps: WebAuthFlowDeps = Object.freeze({
  launchWebAuthFlow: (opts: { readonly url: string; readonly interactive: boolean }) =>
    (
      browser.identity as unknown as {
        launchWebAuthFlow: (o: {
          url: string;
          interactive: boolean;
        }) => Promise<string | undefined>;
      }
    ).launchWebAuthFlow({ url: opts.url, interactive: opts.interactive }),
  getRedirectURL: (): string =>
    (
      browser.identity as unknown as { getRedirectURL: () => string }
    ).getRedirectURL(),
});

/**
 * Build the sign-in URL for the web bridge page. The bridge will append
 * the token fragment and redirect back to `redirect` after the user signs
 * in on the web site.
 */
export function buildSignInUrl(bridgeUrl: string, redirectUri: string): string {
  let url: URL;
  try {
    url = new URL(bridgeUrl);
  } catch (err) {
    throw new AuthProviderError(
      `Bridge URL is not a valid URL: ${bridgeUrl}`,
      err,
    );
  }
  url.searchParams.set('redirect', redirectUri);
  return url.toString();
}

/**
 * Map a raw launchWebAuthFlow rejection to one of our typed errors.
 *
 * Chrome rejection message patterns (observed across Chrome 114-125):
 *   - "The user did not approve access."              -> cancel
 *   - "User interaction required."                     -> cancel (defensive)
 *   - "The user closed the window."                    -> cancel
 *   - "Authorization page could not be loaded."       -> network
 *   - "Network request failed"                         -> network
 *   - "net::ERR_..."                                   -> network
 *   - anything else                                    -> provider
 */
export function classifyLaunchError(err: unknown): AuthError {
  const msg = err instanceof Error ? err.message : String(err);
  if (
    /did not approve|user.*cancel|user interaction required|user closed|authorization page.*cancelled/i.test(
      msg,
    )
  ) {
    return new AuthCancelledError(msg, err);
  }
  if (/could not be loaded|network|net::err|fetch failed|timeout|dns/i.test(msg)) {
    return new AuthNetworkError(msg, err);
  }
  return new AuthProviderError(msg, err);
}

/**
 * Launch the web auth flow. Returns the redirect URL captured by Chrome
 * after the bridge page sets window.location to the chromiumapp.org target.
 *
 * `interactive` defaults to true (popup Sign In click). Pass `false` for a
 * silent refresh attempted by the popup on mount; Chrome rejects silent
 * flows when user interaction is required, which we classify as a
 * cancellation so the caller can quietly stay signed-out.
 */
export async function launchWebAuthFlow(
  bridgeUrl: string,
  deps: WebAuthFlowDeps = defaultWebAuthFlowDeps,
  interactive: boolean = true,
): Promise<string> {
  const redirectUri = deps.getRedirectURL();
  if (typeof redirectUri !== 'string' || redirectUri.length === 0) {
    throw new AuthProviderError(
      `getRedirectURL returned unusable value: ${String(redirectUri)}`,
    );
  }
  const signInUrl = buildSignInUrl(bridgeUrl, redirectUri);

  let responseUrl: string | undefined;
  try {
    responseUrl = await deps.launchWebAuthFlow({
      url: signInUrl,
      interactive,
    });
  } catch (err) {
    throw classifyLaunchError(err);
  }
  if (typeof responseUrl !== 'string' || responseUrl.length === 0) {
    // In interactive mode launchWebAuthFlow should always resolve with a
    // redirect URL; an empty value means Chrome dropped the flow (network
    // fault). In silent mode Chrome returns undefined when it would need
    // to prompt the user, which we surface as a cancellation so the popup
    // stays in the signed-out panel without error.
    if (interactive === false) {
      throw new AuthCancelledError(
        'silent auth flow requires user interaction',
      );
    }
    throw new AuthNetworkError(
      'launchWebAuthFlow returned an empty response URL',
    );
  }
  return responseUrl;
}
