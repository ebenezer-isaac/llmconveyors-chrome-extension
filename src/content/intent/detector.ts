// SPDX-License-Identifier: MIT
/**
 * Page-intent detection for the content script.
 *
 * Wraps the engine's `detectPageIntent` with a small test-environment
 * fallback that recognises the E2E fixture host (localhost:5174) by
 * filename prefix. The engine's `urlToAtsKind` does not know about the
 * test fixture so without this shim every E2E intent lookup would return
 * `{ kind: 'unknown' }` and the highlight flow would short-circuit.
 *
 * Production URLs never enter the fallback (the primary engine path
 * resolves them) and the fallback also requires a job-posting marker so
 * arbitrary localhost pages do not get mis-labelled.
 */

import type { AtsKind, PageIntent } from 'ats-autofill-engine';
import type {
  DetectedIntentPayload,
} from '@/src/background/messaging/protocol-types';
import type { Logger } from '@/src/background/log';

const TEST_FIXTURE_HOST = 'localhost:5174';

function resolveTestFixtureKind(location: Location): AtsKind | null {
  if (location.host !== TEST_FIXTURE_HOST) return null;
  const path = location.pathname.toLowerCase();
  if (path.includes('greenhouse')) return 'greenhouse';
  if (path.includes('lever')) return 'lever';
  if (path.includes('workday')) return 'workday';
  return null;
}

function hasJobPostingJsonLd(doc: Document): boolean {
  const scripts = doc.querySelectorAll('script[type="application/ld+json"]');
  for (const script of Array.from(scripts)) {
    const txt = script.textContent;
    if (txt && txt.includes('"JobPosting"')) return true;
  }
  return false;
}

function hasApplicationFormSignal(doc: Document): boolean {
  const form = doc.querySelector('form');
  if (!form) return false;
  const fillable = form.querySelectorAll(
    'input[type="text"], input[type="email"], input[type="tel"], input[type="url"], input[type="file"], textarea, select',
  );
  return fillable.length >= 3;
}

export interface DetectIntentArgs {
  readonly detectPageIntent: (
    location: Location,
    document: Document,
  ) => PageIntent;
  readonly location: Location;
  readonly document: Document;
}

/**
 * Primary intent detection with a test-fixture fallback. The fallback
 * triggers only on localhost:5174 with a filename prefix matching a
 * supported ATS kind AND a recognised page-kind signal.
 */
export function detectIntentWithFallback(args: DetectIntentArgs): PageIntent {
  const raw = args.detectPageIntent(args.location, args.document);
  if (raw.kind !== 'unknown') return raw;

  const fallbackKind = resolveTestFixtureKind(args.location);
  if (!fallbackKind) return raw;

  if (hasJobPostingJsonLd(args.document)) {
    return {
      kind: fallbackKind,
      pageKind: 'job-posting',
      url: args.location.href,
    };
  }
  if (hasApplicationFormSignal(args.document)) {
    return {
      kind: fallbackKind,
      pageKind: 'application-form',
      url: args.location.href,
    };
  }
  return raw;
}

export interface BuildPayloadArgs {
  readonly intent: PageIntent;
  readonly url: string;
  readonly now: number;
}

/**
 * Map an engine PageIntent to the IPC-friendly `DetectedIntentPayload`
 * (keystone 1.2). Returns null for unknown intents because the bg handler
 * would reject them anyway.
 */
export function buildIntentPayload(
  args: BuildPayloadArgs,
): DetectedIntentPayload | null {
  const { intent } = args;
  if (intent.kind === 'unknown') return null;
  const base: DetectedIntentPayload = {
    tabId: -1,
    url: args.url,
    kind: intent.kind,
    pageKind: intent.pageKind,
    detectedAt: args.now,
  };
  if (intent.pageKind === 'job-posting' && intent.jobData) {
    const title = intent.jobData.title;
    const company = intent.jobData.hiringOrganization?.name;
    return {
      ...base,
      ...(title ? { jobTitle: title } : {}),
      ...(company ? { company } : {}),
    };
  }
  return base;
}

export interface InitIntentDeps {
  readonly logger: Logger;
  readonly location: Location;
  readonly document: Document;
  readonly now: () => number;
  readonly detectPageIntent: (
    location: Location,
    document: Document,
  ) => PageIntent;
  readonly sendIntentDetected: (
    payload: DetectedIntentPayload,
  ) => Promise<void>;
}

/**
 * Called once at content-script bootstrap. Detects intent, constructs the
 * payload, and broadcasts it to the bg. Failures are logged at warn level
 * and swallowed so they never block the rest of the content-script init.
 */
export async function initIntentDetection(
  deps: InitIntentDeps,
): Promise<void> {
  try {
    const intent = detectIntentWithFallback({
      detectPageIntent: deps.detectPageIntent,
      location: deps.location,
      document: deps.document,
    });
    const payload = buildIntentPayload({
      intent,
      url: deps.location.href,
      now: deps.now(),
    });
    if (payload === null) {
      deps.logger.debug('intent unknown, skipping broadcast');
      return;
    }
    await deps.sendIntentDetected(payload);
    deps.logger.info('intent broadcast', {
      kind: payload.kind,
      pageKind: payload.pageKind,
    });
  } catch (err: unknown) {
    deps.logger.warn('intent bootstrap failed', {
      err: err instanceof Error ? err.message : String(err),
    });
  }
}
