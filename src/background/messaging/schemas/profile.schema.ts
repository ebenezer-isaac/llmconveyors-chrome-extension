// SPDX-License-Identifier: MIT
/**
 * Profile schema (matches CanonicalProfile in integration tests).
 *
 * Single source of truth for Profile shape until B1/B2 (ats-autofill-engine)
 * ships. A7 will extend this with JSON-Resume conversion; A5 owns the read path.
 */

import { z } from 'zod';

const SafeUrl = z.string().url().max(2048);
const SafeString = z.string().max(1000);

export const ProfileLocationSchema = z
  .object({
    city: SafeString,
    region: SafeString,
    countryCode: z.string().max(8),
    postalCode: z.string().max(32),
  })
  .strict();

export const ProfileBasicsSchema = z
  .object({
    firstName: SafeString,
    lastName: SafeString,
    email: z.string().email().max(320),
    phone: z.string().max(64),
    location: ProfileLocationSchema,
    website: z.string().max(2048),
    linkedin: z.string().max(2048),
    github: z.string().max(2048),
  })
  .strict();

export const ProfileWorkEntrySchema = z
  .object({
    company: SafeString,
    position: SafeString,
    startDate: z.string().max(32),
    endDate: z.string().max(32),
    summary: z.string().max(4000).optional(),
    highlights: z.array(z.string().max(1000)).max(50).optional(),
  })
  .strict();

export const ProfileEducationEntrySchema = z
  .object({
    institution: SafeString,
    area: SafeString,
    studyType: SafeString,
    startDate: z.string().max(32),
    endDate: z.string().max(32),
  })
  .strict();

export const ProfileSkillSchema = z
  .object({
    name: SafeString,
    level: z.string().max(64),
    keywords: z.array(z.string().max(200)).max(100),
  })
  .strict();

export const ProfileSchema = z
  .object({
    profileVersion: z.literal('1.0'),
    updatedAtMs: z.number().int().nonnegative(),
    basics: ProfileBasicsSchema,
    work: z.array(ProfileWorkEntrySchema).max(200),
    education: z.array(ProfileEducationEntrySchema).max(50),
    skills: z.array(ProfileSkillSchema).max(200),
  })
  .strict();

export type Profile = z.infer<typeof ProfileSchema>;
export type ProfileBasics = z.infer<typeof ProfileBasicsSchema>;
export type ProfileWorkEntry = z.infer<typeof ProfileWorkEntrySchema>;
export type ProfileEducationEntry = z.infer<typeof ProfileEducationEntrySchema>;
export type ProfileSkill = z.infer<typeof ProfileSkillSchema>;
export type ProfileLocation = z.infer<typeof ProfileLocationSchema>;

export type DeepPartial<T> = {
  readonly [K in keyof T]?: T[K] extends ReadonlyArray<infer U>
    ? ReadonlyArray<DeepPartial<U>>
    : T[K] extends object
      ? DeepPartial<T[K]>
      : T[K];
};

/** safe URL, used in other schemas */
export { SafeUrl };
