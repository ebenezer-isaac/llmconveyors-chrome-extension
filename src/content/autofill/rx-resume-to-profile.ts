// SPDX-License-Identifier: MIT
/**
 * Map a backend master-resume.structuredData blob to the engine's Profile
 * shape.
 *
 * The backend stores the user's CV as JSON Resume v1 (or the Rx Resume
 * superset, which embeds JSON Resume under well-known keys). The engine's
 * `jsonResumeToProfile` handles the v1 shape, so this module is a thin
 * adapter that:
 *
 *   1. Peels the Rx Resume `.sections` wrapper if present, projecting it
 *      back onto JSON Resume-shaped keys the engine understands.
 *   2. Delegates to the engine converter.
 *   3. Runs the output through ProfileSchema.safeParse; on failure the
 *      caller receives `null` and treats it as "profile missing".
 *
 * Never throws. Every unexpected path returns null so the autofill pipeline
 * aborts gracefully with reason `'profile-missing'`.
 */

import type { Profile } from 'ats-autofill-engine/profile';
import {
  ProfileSchema,
  jsonResumeToProfile,
} from 'ats-autofill-engine/profile';
import type { Logger } from '@/src/background/log';

export interface MapOptions {
  readonly logger: Logger;
  readonly nowMs: number;
}

/**
 * Convert a backend `structuredData` record into a Profile. Returns null when:
 *  - `structuredData` is missing, empty, or not an object
 *  - the engine converter yields a draft that fails ProfileSchema validation
 */
export function structuredDataToProfile(
  structuredData: Record<string, unknown> | undefined | null,
  opts: MapOptions,
): Profile | null {
  if (!structuredData || typeof structuredData !== 'object') {
    opts.logger.info('structuredData missing / not object; treating as no profile');
    return null;
  }

  const normalized = normalizeToJsonResume(structuredData);
  if (!normalized) {
    opts.logger.info('structuredData does not shape as JSON Resume v1');
    return null;
  }

  const draft = jsonResumeToProfile(normalized, opts.nowMs);
  const parsed = ProfileSchema.safeParse(draft);
  if (!parsed.success) {
    opts.logger.warn('mapped profile failed ProfileSchema validation', {
      issues: parsed.error.issues.length,
      firstIssue: parsed.error.issues[0]?.path.join('.') ?? '<unknown>',
    });
    return null;
  }
  return parsed.data;
}

/**
 * Detect whether the input is already JSON Resume-shaped, or an Rx Resume
 * payload that embeds JSON Resume-shaped sections. Returns a JSON Resume v1
 * candidate object, or null if the input has neither shape.
 *
 * Rx Resume stores its data under `.sections.basics.items[0]`,
 * `.sections.work.items[]`, etc. JSON Resume v1 uses top-level keys
 * `.basics`, `.work[]`, `.education[]`, `.skills[]`.
 */
function normalizeToJsonResume(input: Record<string, unknown>): Record<string, unknown> | null {
  // Already JSON Resume-shaped?
  if (
    isPlainObject(input.basics) ||
    Array.isArray(input.work) ||
    Array.isArray(input.education) ||
    Array.isArray(input.skills)
  ) {
    return input;
  }

  // Rx Resume shape: `.sections.{basics,work,education,skills}`.
  const sections = input.sections;
  if (!isPlainObject(sections)) return null;

  const basics = extractRxSingleton(sections.basics);
  const work = extractRxArray(sections.work);
  const education = extractRxArray(sections.education);
  const skills = extractRxArray(sections.skills);
  const projects = extractRxArray(sections.projects);
  const awards = extractRxArray(sections.awards);
  const languages = extractRxArray(sections.languages);

  if (!basics && work.length === 0 && education.length === 0 && skills.length === 0) {
    return null;
  }

  const out: Record<string, unknown> = {};
  if (basics) out.basics = basics;
  if (work.length > 0) out.work = work;
  if (education.length > 0) out.education = education;
  if (skills.length > 0) out.skills = skills;
  if (projects.length > 0) out.projects = projects;
  if (awards.length > 0) out.awards = awards;
  if (languages.length > 0) out.languages = languages;
  return out;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function extractRxSingleton(section: unknown): Record<string, unknown> | null {
  if (!isPlainObject(section)) return null;
  const items = Array.isArray(section.items) ? section.items : null;
  if (items && items.length > 0 && isPlainObject(items[0])) {
    return items[0];
  }
  // Some Rx payloads inline the singleton fields on the section itself.
  const { items: _items, ...rest } = section;
  void _items;
  if (Object.keys(rest).length > 0) return rest;
  return null;
}

function extractRxArray(section: unknown): Record<string, unknown>[] {
  if (!isPlainObject(section)) return [];
  const items = Array.isArray(section.items) ? section.items : [];
  return items.filter(isPlainObject);
}
