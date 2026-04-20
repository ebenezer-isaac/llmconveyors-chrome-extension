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
  opts.logger.info('structuredDataToProfile: entry', {
    hasInput: Boolean(structuredData),
    inputType: typeof structuredData,
    inputIsNull: structuredData === null,
    inputTopKeys: structuredData && typeof structuredData === 'object'
      ? Object.keys(structuredData as Record<string, unknown>).slice(0, 15)
      : [],
  });

  if (!structuredData || typeof structuredData !== 'object') {
    opts.logger.info('structuredData missing / not object; treating as no profile');
    return null;
  }

  opts.logger.debug('structuredDataToProfile: calling normalizeToJsonResume', {
    topKeys: Object.keys(structuredData).slice(0, 15),
    hasBasics: 'basics' in structuredData,
    basicsType: typeof structuredData.basics,
    basicsIsNull: structuredData.basics === null,
    hasSections: 'sections' in structuredData,
    hasWork: 'work' in structuredData,
    workIsArray: Array.isArray(structuredData.work),
    hasEducation: 'education' in structuredData,
    hasSkills: 'skills' in structuredData,
  });

  const normalized = normalizeToJsonResume(structuredData, opts.logger);
  if (!normalized) {
    opts.logger.info('structuredData does not shape as JSON Resume v1 -- normalizeToJsonResume returned null', {
      topLevelKeys: Object.keys(structuredData).slice(0, 15),
      basicsType: typeof structuredData.basics,
      basicsHasItems: isPlainObject(structuredData.basics) && Array.isArray((structuredData.basics as Record<string,unknown>).items),
    });
    return null;
  }

  opts.logger.info('structuredDataToProfile: normalized OK', {
    normalizedKeys: Object.keys(normalized).slice(0, 15),
    hasBasics: 'basics' in normalized,
    basicsType: typeof normalized.basics,
    basicsIsNull: normalized.basics === null,
    basicsKeys: isPlainObject(normalized.basics)
      ? Object.keys(normalized.basics as Record<string, unknown>).slice(0, 15)
      : [],
    basicsHasName: isPlainObject(normalized.basics)
      ? typeof (normalized.basics as Record<string, unknown>).name === 'string'
      : false,
    basicsNameValue: isPlainObject(normalized.basics)
      ? String((normalized.basics as Record<string, unknown>).name ?? '').slice(0, 40)
      : null,
    basicsHasEmail: isPlainObject(normalized.basics)
      ? typeof (normalized.basics as Record<string, unknown>).email === 'string'
      : false,
    basicsEmailValue: isPlainObject(normalized.basics)
      ? String((normalized.basics as Record<string, unknown>).email ?? '').slice(0, 40)
      : null,
    workCount: Array.isArray(normalized.work) ? (normalized.work as unknown[]).length : 0,
    educationCount: Array.isArray(normalized.education) ? (normalized.education as unknown[]).length : 0,
    skillsCount: Array.isArray(normalized.skills) ? (normalized.skills as unknown[]).length : 0,
  });

  opts.logger.debug('structuredDataToProfile: calling jsonResumeToProfile');
  const draft = jsonResumeToProfile(normalized, opts.nowMs);

  opts.logger.info('structuredDataToProfile: jsonResumeToProfile result', {
    draftKeys: draft && typeof draft === 'object' ? Object.keys(draft as Record<string, unknown>).slice(0, 12) : [],
    draftBasicsKeys: (draft as Record<string, unknown>)?.basics && typeof (draft as Record<string, unknown>).basics === 'object'
      ? Object.keys((draft as Record<string, unknown>).basics as Record<string, unknown>).slice(0, 12)
      : [],
    firstName: String(((draft as Record<string, unknown>)?.basics as Record<string, unknown> | undefined)?.firstName ?? '').slice(0, 30),
    email: String(((draft as Record<string, unknown>)?.basics as Record<string, unknown> | undefined)?.email ?? '').slice(0, 50),
    workCount: Array.isArray((draft as Record<string, unknown>)?.work) ? ((draft as Record<string, unknown>).work as unknown[]).length : 0,
  });

  opts.logger.debug('structuredDataToProfile: sanitizing draft before schema validation');
  const sanitized = sanitizeDraftForSchema(draft, opts.logger);
  opts.logger.info('structuredDataToProfile: sanitized draft', {
    workCount: Array.isArray((sanitized as Record<string, unknown>)?.work)
      ? ((sanitized as Record<string, unknown>).work as unknown[]).length
      : 0,
    educationCount: Array.isArray((sanitized as Record<string, unknown>)?.education)
      ? ((sanitized as Record<string, unknown>).education as unknown[]).length
      : 0,
  });
  opts.logger.debug('structuredDataToProfile: calling ProfileSchema.safeParse');
  const parsed = ProfileSchema.safeParse(sanitized);
  if (!parsed.success) {
    opts.logger.warn('mapped profile failed ProfileSchema validation', {
      issueCount: parsed.error.issues.length,
      issues: parsed.error.issues.slice(0, 5).map(i => ({
        path: i.path.join('.'),
        code: i.code,
        message: i.message,
      })),
    });
    return null;
  }

  opts.logger.info('structuredDataToProfile: ProfileSchema validation passed', {
    firstName: parsed.data.basics.firstName.slice(0, 30),
    email: parsed.data.basics.email.slice(0, 50),
  });
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
 *
 * A third shape exists: "flat Rx Resume" -- sections are at the root level
 * (no `.sections` wrapper) but each is still a section object with an
 * `.items` array rather than the JSON Resume field set.  Detected by
 * `basics` being a plain object whose value carries an `items` array
 * instead of direct string fields like `name` or `email`.
 */
function normalizeToJsonResume(
  input: Record<string, unknown>,
  log: Logger,
): Record<string, unknown> | null {
  log.debug('normalizeToJsonResume: input shape', {
    topKeys: Object.keys(input).slice(0, 15),
    basicsIsPlainObj: isPlainObject(input.basics),
    basicsHasItems: isPlainObject(input.basics) && Array.isArray((input.basics as Record<string,unknown>).items),
    workIsArray: Array.isArray(input.work),
    educationIsArray: Array.isArray(input.education),
    skillsIsArray: Array.isArray(input.skills),
    hasSectionsObj: isPlainObject(input.sections),
  });

  // Flat Rx Resume: sections at root level, each with an `items` array.
  // Must be checked BEFORE the JSON-Resume heuristic because both share
  // `isPlainObject(input.basics)` -- but only this variant has `basics.items`.
  if (isPlainObject(input.basics) && Array.isArray((input.basics).items)) {
    log.info('normalizeToJsonResume: detected FLAT RX-RESUME (basics.items exists)');
    const basics = extractRxSingleton(input.basics);
    const work = extractRxArray(input.work);
    const education = extractRxArray(input.education);
    const skills = extractRxArray(input.skills);
    const projects = extractRxArray(input.projects);
    const awards = extractRxArray(input.awards);
    const languages = extractRxArray(input.languages);

    log.debug('normalizeToJsonResume: flat-rx extraction results', {
      gotBasics: basics !== null,
      basicsKeys: basics ? Object.keys(basics).slice(0, 15) : [],
      workCount: work.length,
      educationCount: education.length,
      skillsCount: skills.length,
    });

    if (!basics && work.length === 0 && education.length === 0 && skills.length === 0) {
      log.warn('normalizeToJsonResume: flat-rx -- all sections empty, returning null');
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
    log.info('normalizeToJsonResume: flat-rx path produced output', { outKeys: Object.keys(out) });
    return out;
  }

  // Already JSON Resume-shaped?
  if (
    isPlainObject(input.basics) ||
    Array.isArray(input.work) ||
    Array.isArray(input.education) ||
    Array.isArray(input.skills)
  ) {
    log.info('normalizeToJsonResume: detected JSON-RESUME shape -- returning input as-is', {
      triggerBasics: isPlainObject(input.basics),
      triggerWork: Array.isArray(input.work),
      triggerEducation: Array.isArray(input.education),
      triggerSkills: Array.isArray(input.skills),
    });
    return input;
  }

  // Rx Resume shape: `.sections.{basics,work,education,skills}`.
  const sections = input.sections;
  if (!isPlainObject(sections)) {
    log.warn('normalizeToJsonResume: no recognized shape -- basics not plain obj, work/edu/skills not arrays, no .sections obj', {
      topKeys: Object.keys(input).slice(0, 15),
      basicsType: typeof input.basics,
      basicsIsNull: input.basics === null,
    });
    return null;
  }

  log.info('normalizeToJsonResume: detected RX-RESUME with .sections wrapper');
  const basics = extractRxSingleton(sections.basics);
  const work = extractRxArray(sections.work);
  const education = extractRxArray(sections.education);
  const skills = extractRxArray(sections.skills);
  const projects = extractRxArray(sections.projects);
  const awards = extractRxArray(sections.awards);
  const languages = extractRxArray(sections.languages);

  log.debug('normalizeToJsonResume: rx-sections extraction results', {
    gotBasics: basics !== null,
    basicsKeys: basics ? Object.keys(basics).slice(0, 15) : [],
    workCount: work.length,
    educationCount: education.length,
    skillsCount: skills.length,
  });

  if (!basics && work.length === 0 && education.length === 0 && skills.length === 0) {
    log.warn('normalizeToJsonResume: rx-sections -- all sections empty, returning null');
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
  log.info('normalizeToJsonResume: rx-sections path produced output', { outKeys: Object.keys(out) });
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

function isValidUrl(s: unknown): boolean {
  if (typeof s !== 'string' || s.length === 0) return false;
  try {
    new URL(s);
    return true;
  } catch {
    return false;
  }
}

const VALID_DATE_RE = /^\d{4}(-\d{2}(-\d{2})?)?$|^Present$/;

function isValidDateStr(s: unknown): boolean {
  return typeof s === 'string' && VALID_DATE_RE.test(s);
}

/**
 * Normalize fields that would cause ProfileSchema.safeParse to fail:
 *   - work[].url that is not a well-formed URL: strip the field (url is optional in schema)
 *   - education[] entries where startDate is missing or invalid: filter the entry out
 *     (startDate is required in ProfileSchema; stripping it would still fail validation)
 *
 * All mutations produce new objects (immutable path).
 */
function sanitizeDraftForSchema(draft: unknown, log: Logger): unknown {
  if (!isPlainObject(draft)) return draft;
  const out: Record<string, unknown> = { ...draft };

  if (Array.isArray(out.work)) {
    out.work = (out.work as unknown[]).map((item) => {
      if (!isPlainObject(item)) return item;
      if ('url' in item && !isValidUrl(item.url)) {
        const { url: _url, ...rest } = item;
        void _url;
        log.debug('sanitizeDraftForSchema: stripped invalid work.url', {
          original: typeof item.url === 'string' ? item.url.slice(0, 80) : String(item.url),
        });
        return rest;
      }
      return item;
    });
  }

  if (Array.isArray(out.education)) {
    out.education = (out.education as unknown[]).filter((item) => {
      if (!isPlainObject(item)) return false;
      if (!isValidDateStr(item.startDate)) {
        log.debug('sanitizeDraftForSchema: dropping education entry with missing/invalid startDate', {
          startDate: typeof item.startDate === 'string' ? item.startDate.slice(0, 40) : String(item.startDate),
          institution: typeof item.institution === 'string' ? item.institution.slice(0, 60) : '',
        });
        return false;
      }
      return true;
    });
  }

  return out;
}
