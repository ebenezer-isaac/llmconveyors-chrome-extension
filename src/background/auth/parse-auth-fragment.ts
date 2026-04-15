// SPDX-License-Identifier: MIT
/**
 * Parse and validate the URL fragment returned by `launchWebAuthFlow` after
 * the A4 web bridge page completes a SuperTokens sign-in.
 *
 * Fragment shape emitted by the bridge:
 *   #at=<accessToken>&rt=<refreshToken>&ft=<fingerprintToken>&exp=<expiresAtMs>
 *
 * Each value is URL-encoded via URLSearchParams on the bridge side. We
 * decode via URLSearchParams on this side so encoding is symmetric.
 *
 * Security posture (defense in depth):
 *   - Host MUST match `<extensionId>.chromiumapp.org` (32-char a-p range)
 *   - Protocol MUST be https
 *   - `#error=` / `?error=` is treated as tampering (bridge never emits it)
 *   - Tokens are length-bounded, restricted to safe char classes
 *   - Expiry must be a positive integer and within a sane future window
 *
 * Every violation throws AuthMalformedResponseError.
 */

import { AuthMalformedResponseError } from './errors';

/** Token is base64url + JWT separator + base64 padding + `+/` legacy base64. */
const SAFE_TOKEN_CHARS = /^[A-Za-z0-9._=+/-]+$/;

/** Chrome extension ID host pattern: 32 a-p chars + `.chromiumapp.org`. */
const CHROMIUMAPP_HOST = /^[a-p]{32}\.chromiumapp\.org$/;

/** Minimum plausible length for the shortest of our tokens. */
const MIN_TOKEN_LENGTH = 20;

/** Maximum token length -- caps DoS attempts via padded fragments. */
const MAX_TOKEN_LENGTH = 8192;

/** Maximum raw redirect URL length. */
const MAX_URL_LENGTH = 16384;

/**
 * Upper bound on how far in the future a fresh access-token expiry may
 * legitimately sit. SuperTokens default is 1h; we allow 24h as a slack
 * factor. Anything beyond 24h is treated as tampering or clock skew.
 */
export const MAX_FUTURE_EXPIRY_MS = 24 * 60 * 60 * 1000;

/**
 * Output of `parseAuthFragment`. Long-name fields map 1:1 onto A5's
 * StoredSession plus the fingerprint token (retained in memory for
 * potential CSRF checks; not persisted because StoredSession does not
 * have a field for it in A5).
 */
export interface ParsedAuthFragment {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly fingerprintToken: string;
  readonly expiresAt: number;
}

export interface ParseAuthFragmentDeps {
  readonly now: () => number;
}

export const defaultParseAuthFragmentDeps: ParseAuthFragmentDeps = Object.freeze({
  now: () => Date.now(),
});

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max)}...` : s;
}

function assertTokenShape(token: string, name: string): void {
  if (token.length < MIN_TOKEN_LENGTH) {
    throw new AuthMalformedResponseError(
      `Token ${name} is too short (${token.length} < ${MIN_TOKEN_LENGTH})`,
    );
  }
  if (token.length > MAX_TOKEN_LENGTH) {
    throw new AuthMalformedResponseError(
      `Token ${name} is too long (${token.length} > ${MAX_TOKEN_LENGTH})`,
    );
  }
  if (!SAFE_TOKEN_CHARS.test(token)) {
    throw new AuthMalformedResponseError(
      `Token ${name} contains disallowed characters`,
    );
  }
  if (token.indexOf('\0') !== -1) {
    throw new AuthMalformedResponseError(
      `Token ${name} contains a null byte`,
    );
  }
}

/**
 * Parse the chromiumapp.org redirect URL. Throws AuthMalformedResponseError
 * on any deviation from the contract.
 */
export function parseAuthFragment(
  redirectUrl: string,
  deps: ParseAuthFragmentDeps = defaultParseAuthFragmentDeps,
): ParsedAuthFragment {
  if (typeof redirectUrl !== 'string') {
    throw new AuthMalformedResponseError(
      `Redirect URL is not a string: ${typeof redirectUrl}`,
    );
  }
  if (redirectUrl.length === 0) {
    throw new AuthMalformedResponseError('Redirect URL is empty');
  }
  if (redirectUrl.length > MAX_URL_LENGTH) {
    throw new AuthMalformedResponseError(
      `Redirect URL too long: ${redirectUrl.length}`,
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(redirectUrl);
  } catch (err) {
    throw new AuthMalformedResponseError(
      'Redirect URL is not a valid URL',
      err,
    );
  }

  if (parsed.protocol !== 'https:') {
    throw new AuthMalformedResponseError(
      `Unexpected redirect protocol: ${parsed.protocol}`,
    );
  }

  if (!CHROMIUMAPP_HOST.test(parsed.hostname)) {
    throw new AuthMalformedResponseError(
      `Redirect host is not a valid chromiumapp.org extension id: ${parsed.hostname}`,
    );
  }

  const queryError = parsed.searchParams.get('error');
  if (queryError !== null) {
    throw new AuthMalformedResponseError(
      `Redirect URL contains ?error= (tampering): ${truncate(queryError, 80)}`,
    );
  }

  const fragment = parsed.hash.startsWith('#')
    ? parsed.hash.slice(1)
    : parsed.hash;

  if (fragment.length === 0) {
    throw new AuthMalformedResponseError('Redirect URL has no fragment');
  }

  const params = new URLSearchParams(fragment);

  const fragError = params.get('error');
  if (fragError !== null) {
    throw new AuthMalformedResponseError(
      `Redirect fragment contains #error= (tampering): ${truncate(fragError, 80)}`,
    );
  }

  const at = params.get('at');
  const rt = params.get('rt');
  const ft = params.get('ft');
  const expRaw = params.get('exp');

  if (at === null || rt === null || ft === null || expRaw === null) {
    const missing = [
      at === null ? 'at' : null,
      rt === null ? 'rt' : null,
      ft === null ? 'ft' : null,
      expRaw === null ? 'exp' : null,
    ]
      .filter((x): x is string => x !== null)
      .join(', ');
    throw new AuthMalformedResponseError(
      `Missing fragment field(s): ${missing}`,
    );
  }

  assertTokenShape(at, 'at');
  assertTokenShape(rt, 'rt');
  assertTokenShape(ft, 'ft');

  const exp = Number(expRaw);
  if (!Number.isFinite(exp) || !Number.isInteger(exp) || exp <= 0) {
    throw new AuthMalformedResponseError(
      `expiresAt is not a positive integer: ${truncate(expRaw, 40)}`,
    );
  }

  const now = deps.now();
  if (exp <= now) {
    throw new AuthMalformedResponseError(
      `expiresAt is already in the past: exp=${exp} now=${now}`,
    );
  }
  if (exp > now + MAX_FUTURE_EXPIRY_MS) {
    throw new AuthMalformedResponseError(
      `expiresAt is more than 24h in the future: exp=${exp} now=${now}`,
    );
  }

  return Object.freeze({
    accessToken: at,
    refreshToken: rt,
    fingerprintToken: ft,
    expiresAt: exp,
  });
}
