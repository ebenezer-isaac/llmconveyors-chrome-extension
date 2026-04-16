// SPDX-License-Identifier: MIT
/**
 * Backend-backed profile reader.
 *
 * Post 101.3: the content-script pipeline no longer owns profile storage.
 * It asks the background worker for the user's master resume via the
 * MASTER_RESUME_GET message, then maps the `structuredData` blob to the
 * engine's Profile shape through `structuredDataToProfile`.
 *
 * NEVER throws. All error paths log and return null; the AutofillController
 * turns null into an `aborted: 'profile-missing'` response.
 */

import type { Profile } from 'ats-autofill-engine/profile';
import type { Logger } from '@/src/background/log';
import { sendMessage } from '@/src/background/messaging/protocol';
import type {
  MasterResumeGetResponse,
  MasterResumeResponse,
} from '@/src/background/master-resume';
import { structuredDataToProfile } from './rx-resume-to-profile';

export interface ProfileReaderDeps {
  readonly logger: Logger;
  readonly now: () => number;
  readonly requestMasterResume: () => Promise<MasterResumeGetResponse>;
}

/**
 * Pull the current master-resume and map it to a Profile.
 *
 * Returns null when:
 *   - the backend returns 404 (user has not created a resume yet)
 *   - the session is unauthenticated
 *   - the backend response shape drifts
 *   - a network error occurs with no cache fallback
 *   - the structuredData blob cannot be shaped into a valid Profile
 */
export async function readProfile(deps: ProfileReaderDeps): Promise<Profile | null> {
  let response: MasterResumeGetResponse | undefined;
  try {
    response = await deps.requestMasterResume();
  } catch (err: unknown) {
    deps.logger.error('MASTER_RESUME_GET sendMessage threw', err);
    return null;
  }
  if (!response) {
    deps.logger.info('MASTER_RESUME_GET returned no response (no bg handler or dropped message)');
    return null;
  }
  if (!response.ok) {
    deps.logger.info('master-resume unavailable', { reason: response.reason });
    return null;
  }
  if (response.resume === null) {
    deps.logger.info('master-resume not created yet');
    return null;
  }
  return extractProfile(response.resume, deps);
}

function extractProfile(
  resume: MasterResumeResponse,
  deps: ProfileReaderDeps,
): Profile | null {
  const structured = resume.structuredData;
  return structuredDataToProfile(
    structured as Record<string, unknown> | undefined,
    { logger: deps.logger, nowMs: deps.now() },
  );
}

/**
 * Default request factory -- dispatches MASTER_RESUME_GET against the
 * extension's messaging surface. Swappable in tests.
 */
export function defaultRequestMasterResume(): Promise<MasterResumeGetResponse> {
  return sendMessage(
    'MASTER_RESUME_GET',
    {} as Record<string, never>,
  ) as Promise<MasterResumeGetResponse>;
}

/**
 * Whether the profile has ENOUGH data to attempt a fill.
 *
 * Gate checks basics.firstName OR basics.email (after trim). If BOTH are
 * missing or whitespace only, the controller aborts with reason
 * 'profile-missing'.
 */
export function isEmptyProfile(p: Profile | null): boolean {
  if (!p) return true;
  const basics = p.basics as { firstName?: string; email?: string } | undefined;
  if (!basics) return true;
  const firstName = basics.firstName?.trim() ?? '';
  const email = basics.email?.trim() ?? '';
  return firstName.length === 0 && email.length === 0;
}
