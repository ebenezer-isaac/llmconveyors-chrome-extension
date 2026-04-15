// SPDX-License-Identifier: MIT
/**
 * JSON Resume -> Profile converter.
 *
 * Narrow subset of the JSON Resume schema we accept for profile ingestion.
 * Missing optional fields are filled with safe empty strings so downstream
 * ProfileSchema.safeParse succeeds.
 *
 * A7 is expected to extend this with theme hints and the full JSON Resume
 * feature surface. A5 ships a minimal but working conversion so the
 * PROFILE_UPLOAD_JSON_RESUME round-trip integration test passes.
 */

import { ProfileSchema, type Profile } from './schemas/profile.schema';

export interface ConvertOk {
  readonly ok: true;
  readonly profile: Profile;
}

export interface ConvertError {
  readonly ok: false;
  readonly errors: { path: string; message: string }[];
}

export type ConvertResult = ConvertOk | ConvertError;

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string');
}

export function jsonResumeToProfile(raw: unknown, nowMs: number): ConvertResult {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return {
      ok: false,
      errors: [{ path: '', message: 'JSON Resume must be a non-null object' }],
    };
  }
  const r = raw as Record<string, unknown>;
  const basicsRaw = (r.basics ?? {}) as Record<string, unknown>;
  const locationRaw = (basicsRaw.location ?? {}) as Record<string, unknown>;
  const profilesRaw = Array.isArray(basicsRaw.profiles) ? basicsRaw.profiles : [];
  const profileByNetwork = (network: string): string => {
    for (const p of profilesRaw) {
      if (typeof p !== 'object' || p === null) continue;
      const po = p as Record<string, unknown>;
      if (typeof po.network === 'string' && po.network.toLowerCase() === network) {
        return asString(po.url);
      }
    }
    return '';
  };

  // JSON Resume uses `name` (full name). Split on first whitespace.
  const name = asString(basicsRaw.name);
  const firstSpace = name.indexOf(' ');
  const firstName = firstSpace >= 0 ? name.slice(0, firstSpace) : name;
  const lastName = firstSpace >= 0 ? name.slice(firstSpace + 1) : '';

  const workRaw = Array.isArray(r.work) ? r.work : [];
  const work = workRaw.map((w) => {
    const wo = (w ?? {}) as Record<string, unknown>;
    return {
      company: asString(wo.company) || asString(wo.name),
      position: asString(wo.position),
      startDate: asString(wo.startDate),
      endDate: asString(wo.endDate),
      summary: typeof wo.summary === 'string' ? wo.summary : undefined,
      highlights: Array.isArray(wo.highlights)
        ? asStringArray(wo.highlights)
        : undefined,
    };
  });

  const educationRaw = Array.isArray(r.education) ? r.education : [];
  const education = educationRaw.map((e) => {
    const eo = (e ?? {}) as Record<string, unknown>;
    return {
      institution: asString(eo.institution),
      area: asString(eo.area),
      studyType: asString(eo.studyType),
      startDate: asString(eo.startDate),
      endDate: asString(eo.endDate),
    };
  });

  const skillsRaw = Array.isArray(r.skills) ? r.skills : [];
  const skills = skillsRaw.map((s) => {
    const so = (s ?? {}) as Record<string, unknown>;
    return {
      name: asString(so.name),
      level: asString(so.level),
      keywords: asStringArray(so.keywords),
    };
  });

  const candidate: Profile = {
    profileVersion: '1.0',
    updatedAtMs: nowMs,
    basics: {
      firstName: firstName || asString(basicsRaw.firstName),
      lastName: lastName || asString(basicsRaw.lastName),
      email: asString(basicsRaw.email, 'unknown@example.com'),
      phone: asString(basicsRaw.phone),
      location: {
        city: asString(locationRaw.city),
        region: asString(locationRaw.region),
        countryCode: asString(locationRaw.countryCode),
        postalCode: asString(locationRaw.postalCode),
      },
      website: asString(basicsRaw.url) || asString(basicsRaw.website),
      linkedin: profileByNetwork('linkedin'),
      github: profileByNetwork('github'),
    },
    work,
    education,
    skills,
  };

  const validated = ProfileSchema.safeParse(candidate);
  if (!validated.success) {
    return {
      ok: false,
      errors: validated.error.issues.map((i) => ({
        path: i.path.join('.'),
        message: i.message,
      })),
    };
  }
  return { ok: true, profile: validated.data };
}
