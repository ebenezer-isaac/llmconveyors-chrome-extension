// SPDX-License-Identifier: MIT
import { describe, it, expect } from 'vitest';
import { deepMergeProfile, scanForbiddenKeys } from '../../../../src/background/profile/profile-merge';

describe('deepMergeProfile', () => {
  it('returns base when patch is undefined', () => {
    expect(deepMergeProfile({ a: 1 }, undefined)).toEqual({ a: 1 });
  });

  it('returns null when patch is null', () => {
    expect(deepMergeProfile({ a: 1 }, null)).toBeNull();
  });

  it('returns patch when patch is a scalar', () => {
    expect(deepMergeProfile({ a: 1 }, 'str')).toBe('str');
  });

  it('replaces arrays wholesale (no element-wise merge)', () => {
    expect(deepMergeProfile({ xs: [1, 2, 3] }, { xs: [9] })).toEqual({ xs: [9] });
  });

  it('returns a fresh array clone, not the patch reference', () => {
    const patch = { xs: [1, 2] };
    const out = deepMergeProfile({ xs: [] as readonly number[] }, patch);
    expect(out).toEqual({ xs: [1, 2] });
    expect((out as { xs: number[] }).xs).not.toBe(patch.xs);
  });

  it('deep-merges nested objects', () => {
    const base = { a: { b: 1, c: 2 } };
    const patch = { a: { c: 20 } };
    expect(deepMergeProfile(base, patch)).toEqual({ a: { b: 1, c: 20 } });
  });

  it('skips __proto__ keys', () => {
    const base = {};
    const patch = JSON.parse('{"__proto__": {"polluted": true}}');
    const result = deepMergeProfile(base, patch) as Record<string, unknown>;
    expect(result.polluted).toBeUndefined();
    expect(({} as { polluted?: unknown }).polluted).toBeUndefined();
  });

  it('skips constructor keys', () => {
    const base = { a: 1 };
    const patch = { constructor: { evil: true } };
    const result = deepMergeProfile(base, patch);
    expect(Object.keys(result as object).sort()).toEqual(['a']);
  });

  it('skips prototype keys', () => {
    const base = { a: 1 };
    const patch = { prototype: { evil: true } };
    const result = deepMergeProfile(base, patch);
    expect(Object.keys(result as object).sort()).toEqual(['a']);
  });

  it('replaces the base when base is a scalar but patch is an object', () => {
    const result = deepMergeProfile(5 as unknown, { a: 1 });
    expect(result).toEqual({ a: 1 });
  });

  it('treats exotic objects (Date) as replacement, not merge', () => {
    const date = new Date();
    const result = deepMergeProfile({ a: 1 }, date);
    expect(result).toBe(date);
  });

  it('does not mutate base on merge', () => {
    const base = { a: { b: 1 } };
    deepMergeProfile(base, { a: { b: 2 } });
    expect(base.a.b).toBe(1);
  });

  it('handles unicode keys and values', () => {
    const base = { naïve: 1 };
    const patch = { naïve: 2, 日本語: '値' };
    expect(deepMergeProfile(base, patch)).toEqual({ naïve: 2, 日本語: '値' });
  });
});

describe('scanForbiddenKeys', () => {
  it('returns null for a clean object', () => {
    expect(scanForbiddenKeys({ a: { b: { c: 1 } } })).toBeNull();
  });

  it('detects __proto__ at top level', () => {
    const obj = JSON.parse('{"__proto__": 1}');
    expect(scanForbiddenKeys(obj)).toContain('__proto__');
  });

  it('detects __proto__ at depth 3', () => {
    const obj = JSON.parse('{"a": {"b": {"__proto__": 1}}}');
    expect(scanForbiddenKeys(obj)).toContain('__proto__');
  });

  it('detects constructor', () => {
    expect(scanForbiddenKeys({ constructor: 1 })).toContain('constructor');
  });

  it('detects prototype', () => {
    expect(scanForbiddenKeys({ prototype: 1 })).toContain('prototype');
  });

  it('returns null for null/primitives', () => {
    expect(scanForbiddenKeys(null)).toBeNull();
    expect(scanForbiddenKeys(42)).toBeNull();
    expect(scanForbiddenKeys('string')).toBeNull();
  });

  it('handles arrays', () => {
    expect(scanForbiddenKeys([1, 2, 3])).toBeNull();
    const arrWithProto = JSON.parse('[{"__proto__": 1}]');
    expect(scanForbiddenKeys(arrWithProto)).toContain('__proto__');
  });

  it('handles circular references', () => {
    const a: Record<string, unknown> = { x: 1 };
    a.self = a;
    expect(scanForbiddenKeys(a)).toBe('circular reference detected');
  });
});
