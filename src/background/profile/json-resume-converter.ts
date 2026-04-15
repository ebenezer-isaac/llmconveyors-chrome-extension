// SPDX-License-Identifier: MIT
/**
 * JSON Resume v1 -> Profile converter.
 *
 * Parses a subset of the JSON Resume v1 schema sufficient to populate the
 * extension's Profile. Extra fields in the input are ignored. Missing
 * optional fields are filled with safe defaults so `ProfileSchema.safeParse`
 * succeeds. An email fallback of `unknown@example.com` keeps otherwise-valid
 * resumes from being rejected for a single missing field.
 *
 * Re-exports the working A5 implementation so legacy imports
 * (`from '../messaging/json-resume-converter'`) and the new
 * profile-module path resolve to the same code path. This phase is the
 * single source of truth for the conversion contract.
 */

export {
  jsonResumeToProfile,
  type ConvertOk,
  type ConvertError,
  type ConvertResult,
} from '../messaging/json-resume-converter';

import {
  jsonResumeToProfile,
  type ConvertResult,
} from '../messaging/json-resume-converter';
import type { Profile } from '../messaging/schemas/profile.schema';

/**
 * Reverse converter: Profile -> JSON Resume v1-shaped object for the
 * options page's "Export" button. Produces the minimal JSON Resume fields
 * that round-trip cleanly back through `jsonResumeToProfile`.
 */
export interface JsonResumeExport {
  readonly basics: {
    readonly name: string;
    readonly email: string;
    readonly phone: string;
    readonly url: string;
    readonly location: {
      readonly city: string;
      readonly region: string;
      readonly countryCode: string;
      readonly postalCode: string;
    };
    readonly profiles: ReadonlyArray<{
      readonly network: string;
      readonly url: string;
    }>;
  };
  readonly work: Profile['work'];
  readonly education: Profile['education'];
  readonly skills: Profile['skills'];
}

export function profileToJsonResume(profile: Profile): JsonResumeExport {
  const fullName = [profile.basics.firstName, profile.basics.lastName]
    .filter((part) => part.length > 0)
    .join(' ');
  const profiles: Array<{ network: string; url: string }> = [];
  if (profile.basics.linkedin) {
    profiles.push({ network: 'LinkedIn', url: profile.basics.linkedin });
  }
  if (profile.basics.github) {
    profiles.push({ network: 'GitHub', url: profile.basics.github });
  }
  return {
    basics: {
      name: fullName,
      email: profile.basics.email,
      phone: profile.basics.phone,
      url: profile.basics.website,
      location: { ...profile.basics.location },
      profiles,
    },
    work: profile.work,
    education: profile.education,
    skills: profile.skills,
  };
}

/**
 * Round-trip sanity check for tests. Converts a Profile to JSON Resume and
 * back; asserts the result is ok.
 */
export function roundTripProfile(profile: Profile, nowMs: number): ConvertResult {
  const exported = profileToJsonResume(profile);
  return jsonResumeToProfile(exported, nowMs);
}
