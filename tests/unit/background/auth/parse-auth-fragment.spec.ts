// SPDX-License-Identifier: MIT
import { describe, it, expect } from 'vitest';
import {
  parseAuthFragment,
  MAX_FUTURE_EXPIRY_MS,
} from '@/src/background/auth/parse-auth-fragment';
import { AuthMalformedResponseError } from '@/src/background/auth/errors';

const VALID_HOST = 'abcdefghijklmnopabcdefghijklmnop'; // 32 chars in a-p
const LONG_TOKEN = 'a'.repeat(64);
const FIXED_NOW = 1_700_000_000_000;
const FUTURE_EXP = FIXED_NOW + 30 * 60 * 1000;
const DEPS = { now: () => FIXED_NOW };

function buildUrl(
  params: Record<string, string | number | undefined>,
  hostOverride?: string,
  protoOverride?: string,
): string {
  const host = hostOverride ?? VALID_HOST;
  const proto = protoOverride ?? 'https';
  const frag = Object.entries(params)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join('&');
  return `${proto}://${host}.chromiumapp.org/cb#${frag}`;
}

describe('parseAuthFragment (adversarial)', () => {
  it('[01] parses a valid fragment with all four tokens', () => {
    const result = parseAuthFragment(
      buildUrl({ at: LONG_TOKEN, rt: LONG_TOKEN, ft: LONG_TOKEN, exp: FUTURE_EXP }),
      DEPS,
    );
    expect(result.accessToken).toBe(LONG_TOKEN);
    expect(result.refreshToken).toBe(LONG_TOKEN);
    expect(result.fingerprintToken).toBe(LONG_TOKEN);
    expect(result.expiresAt).toBe(FUTURE_EXP);
  });

  it('[02] throws on non-string redirectUrl (null)', () => {
    expect(() => parseAuthFragment(null as unknown as string, DEPS)).toThrow(
      AuthMalformedResponseError,
    );
  });

  it('[03] throws on non-string redirectUrl (number)', () => {
    expect(() => parseAuthFragment(42 as unknown as string, DEPS)).toThrow(/not a string/);
  });

  it('[04] throws on empty string', () => {
    expect(() => parseAuthFragment('', DEPS)).toThrow(/empty/);
  });

  it('[05] throws on a 16384+ char URL (DoS clamp)', () => {
    const huge = `https://${VALID_HOST}.chromiumapp.org/cb#at=${'a'.repeat(20000)}`;
    expect(() => parseAuthFragment(huge, DEPS)).toThrow(/too long/);
  });

  it('[06] throws on non-https protocol', () => {
    const bad = buildUrl(
      { at: LONG_TOKEN, rt: LONG_TOKEN, ft: LONG_TOKEN, exp: FUTURE_EXP },
      undefined,
      'http',
    );
    expect(() => parseAuthFragment(bad, DEPS)).toThrow(/protocol/);
  });

  it('[07] throws on non-chromiumapp.org host', () => {
    const bad = `https://evil.com/cb#at=${LONG_TOKEN}&rt=${LONG_TOKEN}&ft=${LONG_TOKEN}&exp=${FUTURE_EXP}`;
    expect(() => parseAuthFragment(bad, DEPS)).toThrow(/chromiumapp\.org/);
  });

  it('[08] accepts chromiumapp.org with uppercase ID (URL normalizes host)', () => {
    // WHATWG URL parser lowercases the hostname, so an uppercase input
    // arrives at the regex in lowercase form. This is safe because the
    // post-normalization host is still a valid extension id.
    const bad = buildUrl(
      { at: LONG_TOKEN, rt: LONG_TOKEN, ft: LONG_TOKEN, exp: FUTURE_EXP },
      VALID_HOST.toUpperCase(),
    );
    expect(() => parseAuthFragment(bad, DEPS)).not.toThrow();
  });

  it('[09] throws on chromiumapp.org with length-31 ID', () => {
    const bad = buildUrl(
      { at: LONG_TOKEN, rt: LONG_TOKEN, ft: LONG_TOKEN, exp: FUTURE_EXP },
      'abcdefghijklmnopabcdefghijklmno',
    );
    expect(() => parseAuthFragment(bad, DEPS)).toThrow(/chromiumapp\.org/);
  });

  it('[10] throws on chromiumapp.org with q-z chars (outside a-p range)', () => {
    const bad = buildUrl(
      { at: LONG_TOKEN, rt: LONG_TOKEN, ft: LONG_TOKEN, exp: FUTURE_EXP },
      'z'.repeat(32),
    );
    expect(() => parseAuthFragment(bad, DEPS)).toThrow(/chromiumapp\.org/);
  });

  it('[11] throws on empty fragment', () => {
    expect(() => parseAuthFragment(`https://${VALID_HOST}.chromiumapp.org/cb`, DEPS)).toThrow(
      /no fragment/,
    );
  });

  it('[12] treats #error= as tampering', () => {
    const bad = buildUrl({ error: 'access_denied' });
    expect(() => parseAuthFragment(bad, DEPS)).toThrow(/tampering/);
  });

  it('[13] treats ?error= in query as tampering', () => {
    const bad = `https://${VALID_HOST}.chromiumapp.org/cb?error=server_error#at=${LONG_TOKEN}&rt=${LONG_TOKEN}&ft=${LONG_TOKEN}&exp=${FUTURE_EXP}`;
    expect(() => parseAuthFragment(bad, DEPS)).toThrow(/tampering/);
  });

  it('[14] throws when at is missing', () => {
    expect(() =>
      parseAuthFragment(
        buildUrl({ rt: LONG_TOKEN, ft: LONG_TOKEN, exp: FUTURE_EXP }),
        DEPS,
      ),
    ).toThrow(/Missing.*at/);
  });

  it('[15] throws when rt is missing', () => {
    expect(() =>
      parseAuthFragment(
        buildUrl({ at: LONG_TOKEN, ft: LONG_TOKEN, exp: FUTURE_EXP }),
        DEPS,
      ),
    ).toThrow(/Missing.*rt/);
  });

  it('[16] throws when ft is missing', () => {
    expect(() =>
      parseAuthFragment(
        buildUrl({ at: LONG_TOKEN, rt: LONG_TOKEN, exp: FUTURE_EXP }),
        DEPS,
      ),
    ).toThrow(/Missing.*ft/);
  });

  it('[17] throws when exp is missing', () => {
    expect(() =>
      parseAuthFragment(
        buildUrl({ at: LONG_TOKEN, rt: LONG_TOKEN, ft: LONG_TOKEN }),
        DEPS,
      ),
    ).toThrow(/Missing.*exp/);
  });

  it('[18] throws when exp is not a number', () => {
    expect(() =>
      parseAuthFragment(
        buildUrl({ at: LONG_TOKEN, rt: LONG_TOKEN, ft: LONG_TOKEN, exp: 'soon' }),
        DEPS,
      ),
    ).toThrow(/positive integer/);
  });

  it('[19] throws when exp is zero or negative', () => {
    expect(() =>
      parseAuthFragment(
        buildUrl({ at: LONG_TOKEN, rt: LONG_TOKEN, ft: LONG_TOKEN, exp: 0 }),
        DEPS,
      ),
    ).toThrow(/positive integer/);
    expect(() =>
      parseAuthFragment(
        buildUrl({ at: LONG_TOKEN, rt: LONG_TOKEN, ft: LONG_TOKEN, exp: -1 }),
        DEPS,
      ),
    ).toThrow(/positive integer/);
  });

  it('[20] throws when exp is in the past', () => {
    const past = FIXED_NOW - 1000;
    expect(() =>
      parseAuthFragment(
        buildUrl({ at: LONG_TOKEN, rt: LONG_TOKEN, ft: LONG_TOKEN, exp: past }),
        DEPS,
      ),
    ).toThrow(/past/);
  });

  it('[21] throws when exp is more than 24h in the future', () => {
    const far = FIXED_NOW + MAX_FUTURE_EXPIRY_MS + 1;
    expect(() =>
      parseAuthFragment(
        buildUrl({ at: LONG_TOKEN, rt: LONG_TOKEN, ft: LONG_TOKEN, exp: far }),
        DEPS,
      ),
    ).toThrow(/24h/);
  });

  it('[22] throws when a token is too short', () => {
    expect(() =>
      parseAuthFragment(
        buildUrl({ at: 'short', rt: LONG_TOKEN, ft: LONG_TOKEN, exp: FUTURE_EXP }),
        DEPS,
      ),
    ).toThrow(/too short/);
  });

  it('[23] throws when a token is too long (>8192)', () => {
    const huge = 'a'.repeat(8193);
    // Build URL manually to stay under overall URL length cap (16384).
    const url = `https://${VALID_HOST}.chromiumapp.org/cb#at=${huge}&rt=${LONG_TOKEN}&ft=${LONG_TOKEN}&exp=${FUTURE_EXP}`;
    expect(() => parseAuthFragment(url, DEPS)).toThrow(/too long/);
  });

  it('[24] throws when a token contains a null byte', () => {
    const bad = `${'a'.repeat(40)}\0payload`;
    expect(() =>
      parseAuthFragment(
        buildUrl({ at: bad, rt: LONG_TOKEN, ft: LONG_TOKEN, exp: FUTURE_EXP }),
        DEPS,
      ),
    ).toThrow(/disallowed|null/);
  });

  it('[25] throws when a token contains a space', () => {
    const bad = `${'a'.repeat(30)} space${'b'.repeat(10)}`;
    expect(() =>
      parseAuthFragment(
        buildUrl({ at: bad, rt: LONG_TOKEN, ft: LONG_TOKEN, exp: FUTURE_EXP }),
        DEPS,
      ),
    ).toThrow(/disallowed/);
  });

  it('[26] throws on RTL override / unicode outside ASCII', () => {
    const bad = `aaaa${'\u202E'}aaaaaaaaaaaaaaaaaaaa`;
    expect(() =>
      parseAuthFragment(
        buildUrl({ at: bad, rt: LONG_TOKEN, ft: LONG_TOKEN, exp: FUTURE_EXP }),
        DEPS,
      ),
    ).toThrow(/disallowed/);
  });

  it('[27] accepts JWT-shaped tokens with dots and equals', () => {
    const jwt =
      'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyXzAwMSJ9.signatureAAAAAAAAA=';
    const result = parseAuthFragment(
      buildUrl({ at: jwt, rt: LONG_TOKEN, ft: LONG_TOKEN, exp: FUTURE_EXP }),
      DEPS,
    );
    expect(result.accessToken).toBe(jwt);
  });

  it('[28] accepts tokens with base64url chars (_ and -)', () => {
    const tok = `${'a'.repeat(20)}_-${'b'.repeat(20)}`;
    const result = parseAuthFragment(
      buildUrl({ at: tok, rt: LONG_TOKEN, ft: LONG_TOKEN, exp: FUTURE_EXP }),
      DEPS,
    );
    expect(result.accessToken).toBe(tok);
  });

  it('[29] returns a frozen object', () => {
    const result = parseAuthFragment(
      buildUrl({ at: LONG_TOKEN, rt: LONG_TOKEN, ft: LONG_TOKEN, exp: FUTURE_EXP }),
      DEPS,
    );
    expect(Object.isFrozen(result)).toBe(true);
  });

  it('[30] throws on `javascript:` protocol attempt', () => {
    expect(() =>
      parseAuthFragment(
        `javascript:alert(1)#at=${LONG_TOKEN}&rt=${LONG_TOKEN}&ft=${LONG_TOKEN}&exp=${FUTURE_EXP}`,
        DEPS,
      ),
    ).toThrow();
  });

  it('[31] every error is an AuthMalformedResponseError (not a plain Error)', () => {
    try {
      parseAuthFragment('', DEPS);
    } catch (err) {
      expect(err).toBeInstanceOf(AuthMalformedResponseError);
      expect((err as Error).name).toBe('AuthMalformedResponseError');
    }
  });
});
