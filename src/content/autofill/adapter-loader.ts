// SPDX-License-Identifier: MIT
/**
 * URL -> AtsKind resolution + dynamic adapter import.
 *
 * Per D1, every vendor adapter sub-entry in ats-autofill-engine exports
 * `adapter: AtsAdapter` (keystone section 6 factory pattern). A8 reads
 * mod.adapter and returns it.
 *
 * Per D1 + review G5, host matching is SUFFIX-based:
 *   host === 'greenhouse.io' || host.endsWith('.greenhouse.io')
 * Substring matching (`host.includes('greenhouse.io')`) is a homograph /
 * phishing weakness and is explicitly rejected.
 */
import type { AtsAdapter, AtsKind } from 'ats-autofill-engine';
import type { Logger } from '@/src/background/log';

export interface AdapterLoaderDeps {
  readonly logger: Logger;
  readonly dynamicImport: (
    specifier: string,
  ) => Promise<{ readonly adapter?: AtsAdapter }>;
}

/**
 * Resolve the ATS kind from a URL. Returns null for any non-ATS URL.
 *
 * The host is lowercased before matching (RFC 3986 allows host
 * case-insensitivity; attackers sometimes use mixed case to slip past
 * naive matchers).
 */
export function resolveAtsKind(url: string): AtsKind | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const host = parsed.host.toLowerCase();
  if (host === 'greenhouse.io' || host.endsWith('.greenhouse.io')) {
    return 'greenhouse';
  }
  if (host === 'jobs.lever.co' || host.endsWith('.jobs.lever.co')) {
    return 'lever';
  }
  if (host === 'myworkdayjobs.com' || host.endsWith('.myworkdayjobs.com')) {
    return 'workday';
  }
  // Meta Careers - no dedicated adapter, uses generic fill
  if (host === 'metacareers.com' || host.endsWith('.metacareers.com')) {
    return null;
  }
  // Test fixture host (localhost:5174) routes by filename prefix so the
  // E2E suite can exercise real adapters against local HTML files. In
  // production (non-localhost) there is no fallback.
  if (host === 'localhost:5174') {
    const path = parsed.pathname.toLowerCase();
    if (path.includes('/greenhouse')) return 'greenhouse';
    if (path.includes('/lever')) return 'lever';
    if (path.includes('/workday')) return 'workday';
  }
  return null;
}

/**
 * Dynamically load the adapter matching the URL. Returns null if no
 * match or if the dynamic import fails.
 *
 * Runtime validation: asserts `mod.adapter.kind === kind` before
 * returning. If a vendor adapter ships the wrong kind we treat it as a
 * load failure (log + null) rather than silently trusting a mismatched
 * adapter.
 */
export async function loadAdapter(
  url: string,
  deps: AdapterLoaderDeps,
): Promise<AtsAdapter | null> {
  const kind = resolveAtsKind(url);
  if (!kind) {
    deps.logger.debug('no ATS match for URL', { url });
    return null;
  }
  deps.logger.info('loading adapter', { kind });

  const specifier = `ats-autofill-engine/${kind}`;
  let mod: { readonly adapter?: AtsAdapter };
  try {
    mod = await deps.dynamicImport(specifier);
  } catch (err: unknown) {
    deps.logger.error('adapter dynamic import threw', err, {
      kind,
      specifier,
    });
    return null;
  }

  const adapter = mod.adapter;
  if (!adapter) {
    deps.logger.error(
      'adapter module missing `adapter` export',
      undefined,
      { kind, specifier },
    );
    return null;
  }
  if (adapter.kind !== kind) {
    deps.logger.error(
      'adapter kind mismatch against URL resolution',
      undefined,
      {
        urlKind: kind,
        adapterKind: adapter.kind,
        specifier,
      },
    );
    return null;
  }

  deps.logger.info('adapter loaded', { kind: adapter.kind });
  return adapter;
}

/**
 * Production dynamic-import function. Tests provide a fake via
 * AdapterLoaderDeps.dynamicImport so the real import() is never called
 * during unit tests.
 *
 * The @vite-ignore hint tells Vite NOT to pre-analyze this dynamic
 * import at build time (pre-analysis would force all three sub-entries
 * into the main chunk, defeating tree-shaking).
 */
export function productionDynamicImport(
  specifier: string,
): Promise<{ readonly adapter?: AtsAdapter }> {
  return import(/* @vite-ignore */ specifier) as Promise<{
    readonly adapter?: AtsAdapter;
  }>;
}
