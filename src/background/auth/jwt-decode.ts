// SPDX-License-Identifier: MIT
/**
 * Minimal no-signature JWT payload decoder.
 *
 * Used ONLY to extract `sub` (userId) from the SuperTokens access token.
 * We do NOT validate the signature here -- the signature is validated
 * server-side by the A2 bridge endpoint that minted the token, and the
 * fingerprint token (ft) in the fragment provides additional CSRF-style
 * protection against replay.
 *
 * Reads the middle segment of a 3-segment JWT, base64url-decodes it, and
 * JSON-parses the result. Every failure path throws AuthMalformedResponseError
 * so the caller can surface a consistent typed error.
 */

import { AuthMalformedResponseError } from './errors';

/** Maximum decoded payload length we accept (bytes). JWTs should be small. */
const MAX_PAYLOAD_BYTES = 32 * 1024;

/** Maximum raw JWT length we will try to decode. */
const MAX_JWT_LENGTH = 16 * 1024;

/**
 * Decode a base64url string to UTF-8. atob() handles standard base64; we
 * normalize the base64url alphabet (`-` -> `+`, `_` -> `/`) and add
 * padding before calling it.
 */
function base64urlDecode(input: string): string {
  if (input.length === 0) {
    throw new AuthMalformedResponseError('JWT segment is empty');
  }
  // Reject anything outside the base64url alphabet before we ever call atob.
  if (!/^[A-Za-z0-9_-]+$/.test(input)) {
    throw new AuthMalformedResponseError(
      'JWT segment contains non-base64url characters',
    );
  }
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (normalized.length % 4)) % 4;
  const padded = normalized + '='.repeat(padLen);
  let decoded: string;
  try {
    decoded = atob(padded);
  } catch (err) {
    throw new AuthMalformedResponseError('JWT segment is not valid base64', err);
  }
  if (decoded.length > MAX_PAYLOAD_BYTES) {
    throw new AuthMalformedResponseError(
      `JWT payload too large: ${decoded.length} bytes`,
    );
  }
  // atob returns a byte string. Convert via TextDecoder so UTF-8 claims
  // (e.g. non-ASCII emails) round-trip correctly.
  const bytes = new Uint8Array(decoded.length);
  for (let i = 0; i < decoded.length; i++) {
    bytes[i] = decoded.charCodeAt(i) & 0xff;
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (err) {
    throw new AuthMalformedResponseError(
      'JWT payload is not valid UTF-8',
      err,
    );
  }
}

/**
 * Decode the payload of a JWT without verifying the signature.
 * Returns the parsed JSON object.
 */
export function decodeJwtPayload(jwt: string): Record<string, unknown> {
  if (typeof jwt !== 'string') {
    throw new AuthMalformedResponseError(
      `JWT is not a string: ${typeof jwt}`,
    );
  }
  if (jwt.length === 0) {
    throw new AuthMalformedResponseError('JWT is empty');
  }
  if (jwt.length > MAX_JWT_LENGTH) {
    throw new AuthMalformedResponseError(
      `JWT too long: ${jwt.length} > ${MAX_JWT_LENGTH}`,
    );
  }
  const segments = jwt.split('.');
  if (segments.length !== 3) {
    throw new AuthMalformedResponseError(
      `JWT must have 3 segments, got ${segments.length}`,
    );
  }
  const payloadSegment = segments[1] ?? '';
  const json = base64urlDecode(payloadSegment);
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (err) {
    throw new AuthMalformedResponseError(
      'JWT payload is not valid JSON',
      err,
    );
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new AuthMalformedResponseError(
      'JWT payload is not a JSON object',
    );
  }
  return parsed as Record<string, unknown>;
}

/**
 * Extract the user id from a JWT payload. SuperTokens and most OIDC-style
 * providers use `sub`; we also accept `userId` for forward compatibility.
 */
export function extractUserIdFromJwt(jwt: string): string {
  const payload = decodeJwtPayload(jwt);
  const candidates: readonly unknown[] = [payload.sub, payload.userId];
  for (const c of candidates) {
    if (typeof c === 'string' && c.length > 0 && c.length <= 128) {
      // Reject null bytes or control characters.
      // eslint-disable-next-line no-control-regex
      if (/[\u0000-\u001f\u007f]/.test(c)) {
        throw new AuthMalformedResponseError(
          'JWT user id contains control characters',
        );
      }
      return c;
    }
  }
  throw new AuthMalformedResponseError(
    'JWT payload is missing a non-empty string `sub` or `userId` claim',
  );
}
