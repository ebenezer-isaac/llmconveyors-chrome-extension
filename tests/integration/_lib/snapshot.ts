// SPDX-License-Identifier: MIT
/**
 * Deep-diff helper for snapshot assertions. Compares `actual` to `expected`
 * ignoring fields with non-deterministic values (timestamps, ids).
 */

interface SnapshotOptions {
  readonly ignoreFields?: readonly string[];
}

const DEFAULT_IGNORES: readonly string[] = [
  'scannedAt',
  'executedAt',
  'planId',
  'requestId',
  'updatedAtMs',
  'detectedAt',
];

interface Diff {
  readonly path: string;
  readonly actual: unknown;
  readonly expected: unknown;
}

/**
 * Deep-equal with ignore-paths support. Throws a readable error on mismatch.
 */
export function assertSnapshot(
  actual: unknown,
  expected: unknown,
  opts: SnapshotOptions = {},
): void {
  const ignores = new Set([...(opts.ignoreFields ?? []), ...DEFAULT_IGNORES]);
  const diff = findDiff(actual, expected, ignores, '');
  if (diff !== null) {
    throw new Error(
      `Snapshot mismatch at ${diff.path || '<root>'}:\n  actual:   ${JSON.stringify(diff.actual)}\n  expected: ${JSON.stringify(diff.expected)}`,
    );
  }
}

function findDiff(a: unknown, b: unknown, ignores: Set<string>, path: string): Diff | null {
  if (a === b) return null;
  if (typeof a !== typeof b) return { path, actual: a, expected: b };
  if (a === null || b === null) return { path, actual: a, expected: b };
  if (typeof a !== 'object') return { path, actual: a, expected: b };
  if (Array.isArray(a)) {
    if (!Array.isArray(b)) return { path, actual: a, expected: b };
    if (a.length !== b.length) return { path, actual: a, expected: b };
    for (let i = 0; i < a.length; i += 1) {
      const sub = findDiff(a[i], b[i], ignores, `${path}[${i}]`);
      if (sub) return sub;
    }
    return null;
  }
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const keys = new Set([...Object.keys(ao), ...Object.keys(bo)]);
  for (const k of keys) {
    if (ignores.has(k)) continue;
    const sub = findDiff(ao[k], bo[k], ignores, path ? `${path}.${k}` : k);
    if (sub) return sub;
  }
  return null;
}
