// SPDX-License-Identifier: MIT
import { describe, it, expect } from 'vitest';
import {
  decodeJwtPayload,
  extractUserIdFromJwt,
} from '@/src/background/auth/jwt-decode';
import { AuthMalformedResponseError } from '@/src/background/auth/errors';

function b64url(input: string): string {
  return Buffer.from(input, 'utf-8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function buildJwt(payload: unknown): string {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify(payload));
  return `${header}.${body}.fakesignature`;
}

describe('decodeJwtPayload', () => {
  it('[01] decodes a standard JWT payload', () => {
    const jwt = buildJwt({ sub: 'user_123', iat: 1700000000 });
    const payload = decodeJwtPayload(jwt);
    expect(payload.sub).toBe('user_123');
    expect(payload.iat).toBe(1700000000);
  });

  it('[02] handles unicode claims (UTF-8 round-trip)', () => {
    const jwt = buildJwt({ sub: 'user_\u00E9_\u4E2D\u6587' });
    const payload = decodeJwtPayload(jwt);
    expect(payload.sub).toBe('user_\u00E9_\u4E2D\u6587');
  });

  it('[03] throws on non-string input', () => {
    expect(() => decodeJwtPayload(null as unknown as string)).toThrow(
      AuthMalformedResponseError,
    );
  });

  it('[04] throws on empty string', () => {
    expect(() => decodeJwtPayload('')).toThrow(/empty/);
  });

  it('[05] throws on 2-segment JWT', () => {
    expect(() => decodeJwtPayload('a.b')).toThrow(/3 segments/);
  });

  it('[06] throws on 4-segment JWT', () => {
    expect(() => decodeJwtPayload('a.b.c.d')).toThrow(/3 segments/);
  });

  it('[07] throws on non-base64url middle segment', () => {
    expect(() => decodeJwtPayload('header.###bad_chars###.sig')).toThrow(
      /non-base64url/,
    );
  });

  it('[08] throws when payload is not JSON', () => {
    const badBody = b64url('not json');
    expect(() => decodeJwtPayload(`header.${badBody}.sig`)).toThrow(/not valid JSON/);
  });

  it('[09] throws when payload is a JSON array (not an object)', () => {
    const jwt = buildJwt([1, 2, 3]);
    expect(() => decodeJwtPayload(jwt)).toThrow(/not a JSON object/);
  });

  it('[10] throws when payload is a JSON primitive', () => {
    const jwt = buildJwt(42);
    expect(() => decodeJwtPayload(jwt)).toThrow(/not a JSON object/);
  });

  it('[11] throws when JWT exceeds max length', () => {
    const padded = 'a'.repeat(17_000);
    expect(() => decodeJwtPayload(padded)).toThrow(/too long/);
  });

  it('[12] throws on empty middle segment', () => {
    expect(() => decodeJwtPayload('header..sig')).toThrow(/empty/);
  });
});

describe('extractUserIdFromJwt', () => {
  it('[01] reads `sub` claim', () => {
    const jwt = buildJwt({ sub: 'user_alpha' });
    expect(extractUserIdFromJwt(jwt)).toBe('user_alpha');
  });

  it('[02] falls back to `userId` claim', () => {
    const jwt = buildJwt({ userId: 'user_beta' });
    expect(extractUserIdFromJwt(jwt)).toBe('user_beta');
  });

  it('[03] prefers `sub` when both present', () => {
    const jwt = buildJwt({ sub: 'user_sub', userId: 'user_uid' });
    expect(extractUserIdFromJwt(jwt)).toBe('user_sub');
  });

  it('[04] throws when both claims are missing', () => {
    const jwt = buildJwt({ name: 'Bob' });
    expect(() => extractUserIdFromJwt(jwt)).toThrow(/sub.*userId/);
  });

  it('[05] throws when sub is empty', () => {
    const jwt = buildJwt({ sub: '' });
    expect(() => extractUserIdFromJwt(jwt)).toThrow();
  });

  it('[06] throws when sub is not a string', () => {
    const jwt = buildJwt({ sub: 12345 });
    expect(() => extractUserIdFromJwt(jwt)).toThrow();
  });

  it('[07] rejects control characters in sub', () => {
    const jwt = buildJwt({ sub: 'user\u0000injected' });
    expect(() => extractUserIdFromJwt(jwt)).toThrow(/control/);
  });

  it('[08] rejects absurdly long sub (>128 chars)', () => {
    const jwt = buildJwt({ sub: 'a'.repeat(200) });
    expect(() => extractUserIdFromJwt(jwt)).toThrow();
  });
});
