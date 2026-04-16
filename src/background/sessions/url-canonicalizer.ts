// SPDX-License-Identifier: MIT
/**
 * URL canonicalizer for per-URL session bindings.
 *
 * Produces a stable cache key for a logical page so the same JD opened
 * with different tracking parameters binds to the same session. The
 * canonicalizer:
 *
 *   1. Rejects non-http(s) URLs (chrome://, file://, about:, javascript:, ...).
 *   2. Lowercases the hostname (DNS is case-insensitive).
 *   3. Preserves the path case-sensitively (Workday + Lever both treat paths
 *      as case-sensitive identifiers).
 *   4. Strips tracking params (utm_*, fbclid, gclid, ref, source, mc_cid,
 *      mc_eid, cmpid, campaign, _hsenc, _hsmi, igshid, yclid).
 *   5. Preserves every other query param so JD-identifying params (e.g.
 *      Workday's `jobId`, Greenhouse's `gh_jid`) survive.
 *   6. Sorts the remaining params alphabetically so key order does not
 *      change the output.
 *   7. Drops the fragment.
 *   8. Normalizes a trailing slash on the path only when the path is
 *      exactly '/'.
 *
 * Returns null when the URL is unparseable or its protocol is not http/https.
 */

const TRACKING_PARAM_DENYLIST: ReadonlySet<string> = new Set([
  'fbclid',
  'gclid',
  'mc_cid',
  'mc_eid',
  'ref',
  'source',
  'cmpid',
  'campaign',
  '_hsenc',
  '_hsmi',
  'igshid',
  'yclid',
]);

function isTrackingParam(name: string): boolean {
  const lower = name.toLowerCase();
  if (lower.startsWith('utm_')) return true;
  return TRACKING_PARAM_DENYLIST.has(lower);
}

function normalizePath(rawPath: string): string {
  if (rawPath.length === 0) return '/';
  if (rawPath === '/') return '/';
  // Preserve path casing; strip only a redundant trailing '/' on a pure root.
  return rawPath;
}

export function canonicalizeUrl(raw: string): string | null {
  if (typeof raw !== 'string' || raw.length === 0) return null;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return null;
  }

  const host = parsed.hostname.toLowerCase();
  const port = parsed.port;
  const path = normalizePath(parsed.pathname);

  const preserved: Array<readonly [string, string]> = [];
  for (const [name, value] of parsed.searchParams) {
    if (isTrackingParam(name)) continue;
    preserved.push([name, value]);
  }
  preserved.sort((a, b) => {
    if (a[0] < b[0]) return -1;
    if (a[0] > b[0]) return 1;
    if (a[1] < b[1]) return -1;
    if (a[1] > b[1]) return 1;
    return 0;
  });

  const queryString = preserved
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');

  const portSegment = port.length > 0 ? `:${port}` : '';
  const querySegment = queryString.length > 0 ? `?${queryString}` : '';
  return `${parsed.protocol}//${host}${portSegment}${path}${querySegment}`;
}
