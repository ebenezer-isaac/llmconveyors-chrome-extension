# Agent 47 — Profile Schema for `@ebenezer-isaac/autofill-core`

## Design Principles

- **JSON Resume v1.0.0 compatible**: superset. Any valid JSON Resume flows through `basics`/`work[]`/etc. unchanged. Consumers can export to JSON Resume by stripping the extensions.
- **Pure data, no I/O**: resume bytes are referenced by `ResumeHandle` — the core never touches Blob/File.
- **Serializable**: everything is JSON-round-trippable. Adapter handles Blob storage out-of-band.
- **No `any`**: strict typing throughout. Discriminated unions for enums.
- **Versioned**: `profileVersion` field drives future migrations.

## Non-Goals

The profile is NOT:
- An application tracker (no `appliedJobs[]`, no history)
- An analytics store (no metrics, no counters)
- A credentials vault (no passwords, no OAuth tokens, no session data)
- A CRM (no employer notes, no outreach logs)

It is a **pure input** to `fill(formModel, profile)`. Anything stateful lives in the extension adapter's own storage namespace.

---

## `profile.schema.ts`

```ts
/**
 * @ebenezer-isaac/autofill-core — Profile Schema v1.0
 * Extends JSON Resume v1.0.0 with ATS-required fields.
 * https://jsonresume.org/schema/
 */

export type ProfileVersion = '1.0';

export interface Profile {
  /** Schema version for migrations. Always pinned at creation time. */
  readonly profileVersion: ProfileVersion;
  /** Core identity, contact, and summary — extends JSON Resume `basics`. */
  basics: Basics;
  work: ReadonlyArray<WorkExperience>;
  education: ReadonlyArray<Education>;
  skills: ReadonlyArray<Skill>;
  languages: ReadonlyArray<Language>;
  certificates: ReadonlyArray<Certificate>;
  projects: ReadonlyArray<Project>;
  volunteer: ReadonlyArray<Volunteer>;
  awards: ReadonlyArray<Award>;
  publications: ReadonlyArray<Publication>;
  references: ReadonlyArray<Reference>;
  /** ATS extension: job-hunt preferences (salary, auth, remote, etc.). */
  jobPreferences: JobPreferences;
  /** ATS extension: optional EEO self-identification (US). All fields optional. */
  demographics: Demographics;
  /** ATS extension: uploaded documents referenced by ID (adapter resolves). */
  documents: Documents;
  /** Per-employer Q&A cache. Key = normalized question text or SHA-1 hash. */
  customAnswers: Readonly<Record<string, string>>;
  /** Per-application consents. Never persisted as `true` globally — opt-in each time. */
  consents: Consents;
}

export interface Basics {
  /** Full display name, e.g. "Ada Lovelace". JSON Resume field. */
  name: string;
  /** Given name, e.g. "Ada". ATS extension. */
  firstName: string;
  /** Family name, e.g. "Lovelace". ATS extension. */
  lastName: string;
  /** Preferred/chosen name, e.g. "Ada" vs legal "Augusta". ATS extension. */
  preferredName?: string;
  /** Pronouns, e.g. "she/her". ATS extension. */
  pronouns?: string;
  /** Job title headline, e.g. "Senior Software Engineer". */
  label?: string;
  /** Contact email. RFC 5322. */
  email: string;
  /** E.164 phone, e.g. "+442071234567". */
  phone?: string;
  /** Personal website URL. */
  url?: string;
  /** Short professional summary (<= 1000 chars). */
  summary?: string;
  location?: Location;
  profiles: ReadonlyArray<SocialProfile>;
}

export interface Location {
  address?: string;
  postalCode?: string;
  city?: string;
  /** State/region, e.g. "CA". */
  region?: string;
  /** ISO 3166-1 alpha-2, e.g. "US". */
  countryCode?: string;
}

export interface SocialProfile {
  /** Network name, e.g. "LinkedIn", "GitHub". */
  network: string;
  username: string;
  url: string;
}

export interface WorkExperience {
  name: string;
  position: string;
  url?: string;
  /** ISO-8601 date, e.g. "2022-01-15". */
  startDate: string;
  /** ISO-8601 date, or undefined if current. */
  endDate?: string;
  summary?: string;
  highlights: ReadonlyArray<string>;
  location?: string;
}

export interface Education {
  institution: string;
  url?: string;
  /** Degree area, e.g. "Computer Science". */
  area: string;
  /** Study type, e.g. "Bachelor", "Master". */
  studyType: string;
  startDate: string;
  endDate?: string;
  /** GPA as string to preserve formatting, e.g. "3.8/4.0". */
  score?: string;
  courses: ReadonlyArray<string>;
}

export interface Skill {
  name: string;
  /** "Beginner" | "Intermediate" | "Advanced" | "Master" — free-text per JSON Resume. */
  level?: string;
  keywords: ReadonlyArray<string>;
}

export interface Language {
  language: string;
  /** "Native" | "Fluent" | "Professional" | "Conversational" | "Basic". */
  fluency: string;
}

export interface Certificate {
  name: string;
  date: string;
  issuer: string;
  url?: string;
}

export interface Project {
  name: string;
  description?: string;
  highlights: ReadonlyArray<string>;
  keywords: ReadonlyArray<string>;
  startDate?: string;
  endDate?: string;
  url?: string;
  roles: ReadonlyArray<string>;
  entity?: string;
  type?: string;
}

export interface Volunteer {
  organization: string;
  position: string;
  url?: string;
  startDate: string;
  endDate?: string;
  summary?: string;
  highlights: ReadonlyArray<string>;
}

export interface Award {
  title: string;
  date: string;
  awarder: string;
  summary?: string;
}

export interface Publication {
  name: string;
  publisher: string;
  releaseDate: string;
  url?: string;
  summary?: string;
}

export interface Reference {
  name: string;
  reference: string;
}

// --- ATS extensions below --------------------------------------------------

export type RemotePreference = 'remote' | 'hybrid' | 'onsite' | 'any';
export type SalaryPeriod = 'hour' | 'day' | 'month' | 'year';

export interface WorkAuthorization {
  /** Region code: "US" | "UK" | "EU" | "CA" | "AU" | ISO country code. */
  region: string;
  /** Is the candidate currently authorized to work in this region? */
  authorized: boolean;
  /** Will the candidate now or in the future require sponsorship? */
  requiresSponsorship: boolean;
}

export interface SalaryExpectation {
  min: number;
  max: number;
  /** ISO 4217, e.g. "USD". */
  currency: string;
  period: SalaryPeriod;
}

export interface JobPreferences {
  workAuthorization: ReadonlyArray<WorkAuthorization>;
  salaryExpectation?: SalaryExpectation;
  /** ISO-8601 date the candidate can start. */
  availabilityDate?: string;
  willingToRelocate: boolean;
  remotePreference: RemotePreference;
}

export type DemographicAnswer<T extends string> = T | 'decline_to_answer';

export type Gender = DemographicAnswer<'male' | 'female' | 'non_binary' | 'other'>;
export type Race = DemographicAnswer<
  | 'american_indian_alaska_native'
  | 'asian'
  | 'black_african_american'
  | 'hispanic_latino'
  | 'native_hawaiian_pacific_islander'
  | 'white'
  | 'two_or_more'
>;
export type VeteranStatus = DemographicAnswer<'veteran' | 'not_veteran' | 'protected_veteran'>;
export type DisabilityStatus = DemographicAnswer<'yes' | 'no'>;

export interface Demographics {
  gender?: Gender;
  race?: Race;
  veteranStatus?: VeteranStatus;
  disabilityStatus?: DisabilityStatus;
}

/**
 * Adapter-resolved handle to a stored document.
 * `id` is opaque to the core; the extension adapter maps it to chrome.storage.local
 * (or IDB) where the Blob lives. Core never reads bytes.
 */
export interface ResumeHandle {
  id: string;
  filename: string;
  /** MIME type, e.g. "application/pdf". */
  mimeType: string;
  sizeBytes: number;
  /** ISO-8601 timestamp. */
  lastUpdated: string;
}

export interface Documents {
  resume?: ResumeHandle;
  coverLetter?: ResumeHandle;
}

export interface Consents {
  /** User accepted employer's privacy policy for this application. */
  privacyPolicy: boolean;
  /** User opted in to marketing / talent community. */
  marketing: boolean;
}

// --- Migration slot --------------------------------------------------------

/** Reserved for v1.0 -> v1.1 upgrades. Not implemented yet. */
export type ProfileMigration<From, To> = (input: From) => To;

// --- Factory ---------------------------------------------------------------

export function createEmptyProfile(): Profile {
  return {
    profileVersion: '1.0',
    basics: {
      name: '',
      firstName: '',
      lastName: '',
      email: '',
      profiles: [],
    },
    work: [],
    education: [],
    skills: [],
    languages: [],
    certificates: [],
    projects: [],
    volunteer: [],
    awards: [],
    publications: [],
    references: [],
    jobPreferences: {
      workAuthorization: [],
      willingToRelocate: false,
      remotePreference: 'any',
    },
    demographics: {},
    documents: {},
    customAnswers: {},
    consents: {
      privacyPolicy: false,
      marketing: false,
    },
  };
}
```

---

## `profile.zod.ts`

```ts
import { z } from 'zod';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'ISO-8601 date required');
const isoTimestamp = z.string().datetime();
const nonEmpty = (max: number) => z.string().trim().min(1).max(max);

const LocationSchema = z.object({
  address: z.string().max(200).optional(),
  postalCode: z.string().max(20).optional(),
  city: z.string().max(100).optional(),
  region: z.string().max(100).optional(),
  countryCode: z.string().length(2).optional(),
});

const SocialProfileSchema = z.object({
  network: nonEmpty(50),
  username: nonEmpty(100),
  url: z.string().url(),
});

const BasicsSchema = z.object({
  name: z.string().max(200),
  firstName: z.string().max(100),
  lastName: z.string().max(100),
  preferredName: z.string().max(100).optional(),
  pronouns: z.string().max(30).optional(),
  label: z.string().max(150).optional(),
  email: z.string().email(),
  phone: z.string().max(30).optional(),
  url: z.string().url().optional(),
  summary: z.string().max(1000).optional(),
  location: LocationSchema.optional(),
  profiles: z.array(SocialProfileSchema).max(20),
});

const WorkSchema = z.object({
  name: nonEmpty(200),
  position: nonEmpty(150),
  url: z.string().url().optional(),
  startDate: isoDate,
  endDate: isoDate.optional(),
  summary: z.string().max(2000).optional(),
  highlights: z.array(z.string().max(500)).max(20),
  location: z.string().max(200).optional(),
});

const EducationSchema = z.object({
  institution: nonEmpty(200),
  url: z.string().url().optional(),
  area: z.string().max(150),
  studyType: z.string().max(100),
  startDate: isoDate,
  endDate: isoDate.optional(),
  score: z.string().max(20).optional(),
  courses: z.array(z.string().max(200)).max(50),
});

const SkillSchema = z.object({
  name: nonEmpty(100),
  level: z.string().max(50).optional(),
  keywords: z.array(z.string().max(50)).max(30),
});

const LanguageSchema = z.object({
  language: nonEmpty(50),
  fluency: nonEmpty(50),
});

const CertificateSchema = z.object({
  name: nonEmpty(200),
  date: isoDate,
  issuer: nonEmpty(200),
  url: z.string().url().optional(),
});

const ProjectSchema = z.object({
  name: nonEmpty(200),
  description: z.string().max(2000).optional(),
  highlights: z.array(z.string().max(500)).max(20),
  keywords: z.array(z.string().max(50)).max(30),
  startDate: isoDate.optional(),
  endDate: isoDate.optional(),
  url: z.string().url().optional(),
  roles: z.array(z.string().max(100)).max(10),
  entity: z.string().max(200).optional(),
  type: z.string().max(50).optional(),
});

const VolunteerSchema = z.object({
  organization: nonEmpty(200),
  position: nonEmpty(150),
  url: z.string().url().optional(),
  startDate: isoDate,
  endDate: isoDate.optional(),
  summary: z.string().max(2000).optional(),
  highlights: z.array(z.string().max(500)).max(20),
});

const AwardSchema = z.object({
  title: nonEmpty(200),
  date: isoDate,
  awarder: nonEmpty(200),
  summary: z.string().max(1000).optional(),
});

const PublicationSchema = z.object({
  name: nonEmpty(200),
  publisher: nonEmpty(200),
  releaseDate: isoDate,
  url: z.string().url().optional(),
  summary: z.string().max(1000).optional(),
});

const ReferenceSchema = z.object({
  name: nonEmpty(200),
  reference: z.string().max(2000),
});

const WorkAuthSchema = z.object({
  region: z.string().min(2).max(10),
  authorized: z.boolean(),
  requiresSponsorship: z.boolean(),
});

const SalarySchema = z.object({
  min: z.number().nonnegative().finite(),
  max: z.number().nonnegative().finite(),
  currency: z.string().length(3),
  period: z.enum(['hour', 'day', 'month', 'year']),
}).refine((s) => s.max >= s.min, 'max must be >= min');

const JobPreferencesSchema = z.object({
  workAuthorization: z.array(WorkAuthSchema).max(20),
  salaryExpectation: SalarySchema.optional(),
  availabilityDate: isoDate.optional(),
  willingToRelocate: z.boolean(),
  remotePreference: z.enum(['remote', 'hybrid', 'onsite', 'any']),
});

const declineable = <T extends [string, ...string[]]>(vals: T) =>
  z.enum([...vals, 'decline_to_answer'] as [string, ...string[]]);

const DemographicsSchema = z.object({
  gender: declineable(['male', 'female', 'non_binary', 'other']).optional(),
  race: declineable([
    'american_indian_alaska_native', 'asian', 'black_african_american',
    'hispanic_latino', 'native_hawaiian_pacific_islander', 'white', 'two_or_more',
  ]).optional(),
  veteranStatus: declineable(['veteran', 'not_veteran', 'protected_veteran']).optional(),
  disabilityStatus: declineable(['yes', 'no']).optional(),
});

const ResumeHandleSchema = z.object({
  id: nonEmpty(200),
  filename: nonEmpty(255),
  mimeType: nonEmpty(100),
  sizeBytes: z.number().int().nonnegative().max(25 * 1024 * 1024),
  lastUpdated: isoTimestamp,
});

const DocumentsSchema = z.object({
  resume: ResumeHandleSchema.optional(),
  coverLetter: ResumeHandleSchema.optional(),
});

const ConsentsSchema = z.object({
  privacyPolicy: z.boolean(),
  marketing: z.boolean(),
});

export const ProfileSchema = z.object({
  profileVersion: z.literal('1.0'),
  basics: BasicsSchema,
  work: z.array(WorkSchema).max(50),
  education: z.array(EducationSchema).max(20),
  skills: z.array(SkillSchema).max(100),
  languages: z.array(LanguageSchema).max(20),
  certificates: z.array(CertificateSchema).max(50),
  projects: z.array(ProjectSchema).max(50),
  volunteer: z.array(VolunteerSchema).max(30),
  awards: z.array(AwardSchema).max(30),
  publications: z.array(PublicationSchema).max(50),
  references: z.array(ReferenceSchema).max(10),
  jobPreferences: JobPreferencesSchema,
  demographics: DemographicsSchema,
  documents: DocumentsSchema,
  customAnswers: z.record(z.string().max(500), z.string().max(5000)),
  consents: ConsentsSchema,
});

export type ProfileInput = z.input<typeof ProfileSchema>;
export type ProfileOutput = z.output<typeof ProfileSchema>;
```

---

## Serialization & Storage

- `Profile` is 100% JSON-safe. `JSON.stringify(profile)` round-trips cleanly.
- Resume/cover letter Blobs are stored separately by the extension adapter (`chrome.storage.local` has 10MB cap — use IndexedDB for `>1MB` files). The adapter exposes `getDocumentBlob(id: string): Promise<Blob>`.
- When the engine produces fill instructions for a file input, it emits `{ kind: 'file', handleId: resume.id }` — the adapter resolves the Blob at attach time.

## Migration Path

```ts
// Future v1.1 example (not implemented):
// const migrate_1_0_to_1_1: ProfileMigration<ProfileV1_0, ProfileV1_1> = (p) => ({ ... });
```

Migration registry lives in a sibling file `profile.migrations.ts` when v1.1 lands. The loader checks `profileVersion` and chains migrations up to current.

---

Confidence: 88%
Filename: `e:\llmconveyors.com\temp\impl\100-chrome-extension-mvp\investigation\47-profile-schema.md`
