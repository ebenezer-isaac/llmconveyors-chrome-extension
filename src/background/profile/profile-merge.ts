// SPDX-License-Identifier: MIT
/**
 * Deep-merge utility for Profile patches.
 *
 * Rules:
 *   - scalars in the patch REPLACE the base
 *   - arrays in the patch REPLACE the base wholesale
 *   - nested plain objects merge recursively
 *   - `undefined` in the patch is a no-op on that key
 *   - `null` in the patch writes `null`
 *   - forbidden keys (__proto__, constructor, prototype) are rejected at
 *     every depth as defence-in-depth against prototype pollution
 *
 * The merge does NOT validate the result against ProfileSchema -- callers
 * run the Zod parse after merging so corrupt patches surface as field-level
 * errors rather than a rejected merge.
 */

const FORBIDDEN_KEYS: ReadonlySet<string> = new Set([
  '__proto__',
  'constructor',
  'prototype',
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === null || proto === Object.prototype;
}

/**
 * Recursively merge `patch` onto `base`. Returns a fresh object; neither
 * argument is mutated.
 */
export function deepMergeProfile<T>(base: T, patch: unknown): T {
  if (patch === undefined) return base;
  if (patch === null) return null as unknown as T;
  if (typeof patch !== 'object') return patch as T;
  if (Array.isArray(patch)) {
    // Arrays replace wholesale; clone to keep base immutable.
    return [...patch] as unknown as T;
  }
  if (!isPlainObject(patch)) {
    // Some exotic object (Date, Map, ...) -- replace wholesale.
    return patch as T;
  }
  if (
    base === null ||
    base === undefined ||
    typeof base !== 'object' ||
    Array.isArray(base) ||
    !isPlainObject(base)
  ) {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(patch)) {
      if (FORBIDDEN_KEYS.has(key)) continue;
      out[key] = patch[key];
    }
    return out as T;
  }
  const result: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const key of Object.keys(patch)) {
    if (FORBIDDEN_KEYS.has(key)) continue;
    const patchValue = patch[key];
    const baseValue = (base as Record<string, unknown>)[key];
    result[key] = deepMergeProfile(baseValue, patchValue);
  }
  return result as T;
}

/**
 * Scan `value` for forbidden keys at any depth. Returns a reason string if
 * a forbidden key is found, `null` otherwise. Used by the message handler
 * as an early-reject before running the schema parse (a stricter schema
 * that used `.passthrough()` could otherwise silently keep them).
 */
export function scanForbiddenKeys(value: unknown): string | null {
  if (value === null || typeof value !== 'object') return null;
  const seen = new WeakSet<object>();
  const queue: unknown[] = [value];
  while (queue.length > 0) {
    const node = queue.shift();
    if (node === null || typeof node !== 'object') continue;
    if (seen.has(node as object)) return 'circular reference detected';
    seen.add(node as object);
    if (Array.isArray(node)) {
      for (const item of node) {
        if (item !== null && typeof item === 'object') queue.push(item);
      }
      continue;
    }
    for (const key of Object.keys(node as object)) {
      if (FORBIDDEN_KEYS.has(key)) {
        return `forbidden key: ${key}`;
      }
      const child = (node as Record<string, unknown>)[key];
      if (child !== null && typeof child === 'object') queue.push(child);
    }
  }
  return null;
}
