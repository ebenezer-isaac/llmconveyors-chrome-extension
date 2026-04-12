# ATS Field Taxonomy — Canonical Semantic Types

**Scope**: Exhaustive enumeration of semantic field types for autofill-core, covering Mozilla's `autocomplete` baseline plus ATS-specific fields observed on Greenhouse, Lever, Workday, and Ashby application forms.

---

## 1. Baseline: Mozilla `autocomplete` Tokens (Identity, Contact, Address)

Per WHATWG / MDN, the following tokens are standardized. autofill-core MUST accept all of them as primary signals.

### Name
`name`, `honorific-prefix`, `given-name`, `additional-name`, `family-name`, `honorific-suffix`, `nickname`

### Digital Contact
`email`, `tel`, `tel-country-code`, `tel-national`, `tel-area-code`, `tel-local`, `tel-local-prefix`, `tel-local-suffix`, `tel-extension`, `impp`

### Address
`street-address`, `address-line1`, `address-line2`, `address-line3`, `address-level1` (state/province), `address-level2` (city), `address-level3`, `address-level4`, `postal-code`, `country`, `country-name`

### Personal
`organization`, `organization-title`, `bday`, `bday-day`, `bday-month`, `bday-year`, `sex`, `language`, `url`, `photo`

### Credentials & Payment (out of scope for job applications but passed through)
`username`, `current-password`, `new-password`, `one-time-code`, `cc-*`, `transaction-*`

### Modifiers
`home`, `work`, `mobile`, `fax`, `pager`, `shipping`, `billing`, `section-*`

---

## 2. ATS-Specific Extensions

The following types extend the Mozilla set. They are needed because ATS application forms universally collect data that browser autofill does not model.

### 2.1 Resume & Documents
| Type                   | HTML             | Synonyms                                                                         | Platforms       |
|------------------------|------------------|----------------------------------------------------------------------------------|-----------------|
| `resume-upload`        | `file`           | resume, cv, curriculum vitae, resume/cv, upload resume, attach resume            | GH, LV, WD, AB  |
| `resume-text`          | `textarea`       | paste resume, resume text                                                        | GH (rare)       |
| `cover-letter-upload`  | `file`           | cover letter, coverletter, upload cover letter, attach cover letter, motivation  | GH, LV, AB      |
| `cover-letter-text`    | `textarea`       | cover letter, why are you interested, tell us why                                | GH, LV, AB      |
| `transcript-upload`    | `file`           | transcript, academic transcript                                                  | WD, AB          |
| `portfolio-upload`     | `file`           | portfolio, work samples, writing sample                                          | GH (design)     |
| `additional-file`      | `file`           | additional documents, supporting documents, other                                | WD              |

### 2.2 Professional Links
| Type              | HTML     | Synonyms                                                     | Platforms |
|-------------------|----------|--------------------------------------------------------------|-----------|
| `linkedin-url`    | `url`    | linkedin, linkedin profile, linkedin url, li profile         | all       |
| `github-url`      | `url`    | github, github profile, git url                              | GH, LV, AB|
| `portfolio-url`   | `url`    | portfolio, portfolio website, work samples url               | GH, LV, AB|
| `personal-website`| `url`    | website, personal website, blog, homepage                    | all       |
| `twitter-url`     | `url`    | twitter, x profile, twitter handle                           | LV        |
| `dribbble-url`    | `url`    | dribbble, design portfolio                                   | GH (design)|
| `behance-url`     | `url`    | behance                                                      | GH (design)|
| `stackoverflow-url`| `url`   | stack overflow, stackoverflow profile                        | GH (eng)  |

### 2.3 Current Employment / Experience
| Type                 | HTML       | Synonyms                                                                | Platforms |
|----------------------|------------|-------------------------------------------------------------------------|-----------|
| `current-company`    | `text`     | current employer, current company, employer, company                   | WD, AB    |
| `current-title`      | `text`     | current title, current position, current role, job title               | WD, AB    |
| `years-experience`   | `number`   | years of experience, yoe, total experience, relevant experience        | WD, AB    |
| `experience-summary` | `textarea` | experience summary, brief summary, professional summary                | WD        |
| `previous-employer`  | `text`     | previous employer, last company                                        | WD        |
| `notice-period`      | `text`     | notice period, notice, availability to start                           | WD, AB    |

### 2.4 Education
| Type                 | HTML       | Synonyms                                                   | Platforms |
|----------------------|------------|------------------------------------------------------------|-----------|
| `education-level`    | `select`   | highest education, degree, education level                | WD, AB    |
| `school-name`        | `text`     | school, university, college, institution                  | WD        |
| `field-of-study`     | `text`     | major, field of study, discipline, concentration          | WD        |
| `graduation-year`    | `number`   | graduation year, year graduated, year of completion       | WD, AB    |
| `gpa`                | `number`   | gpa, grade point average                                   | WD (US)   |

### 2.5 Work Authorization / Visa
| Type                          | HTML       | Synonyms                                                                                              | Platforms |
|-------------------------------|------------|-------------------------------------------------------------------------------------------------------|-----------|
| `work-auth-us`                | `radio`    | authorized to work in the us, legally authorized, work authorization                                 | GH, LV, AB|
| `visa-sponsorship-required`   | `radio`    | require sponsorship, need sponsorship, will you now or in the future require sponsorship              | GH, LV, AB|
| `work-auth-country`           | `select`   | authorized to work in (country), right to work, work permit                                           | GH (EU), WD|
| `citizenship`                 | `select`   | country of citizenship, nationality                                                                   | WD (gov)  |
| `security-clearance`          | `select`   | security clearance, clearance level                                                                   | WD (gov)  |

### 2.6 Compensation & Availability
| Type                  | HTML       | Synonyms                                                        | Platforms |
|-----------------------|------------|-----------------------------------------------------------------|-----------|
| `salary-expectation`  | `text`     | salary expectations, expected salary, desired salary            | all       |
| `salary-min`          | `number`   | minimum salary, salary floor                                    | GH, LV    |
| `salary-max`          | `number`   | maximum salary, target salary                                   | GH, LV    |
| `salary-currency`     | `select`   | currency, salary currency                                       | GH (EU)   |
| `current-salary`      | `number`   | current salary, current compensation                            | WD (some) |
| `start-date`          | `date`     | start date, earliest start date, available from                 | all       |
| `availability`        | `text`     | availability, when can you start                                | LV, AB    |
| `relocation-willing`  | `radio`    | willing to relocate, open to relocation                         | WD        |
| `remote-preference`   | `select`   | work preference, remote/hybrid/onsite                           | LV, AB    |

### 2.7 Location
| Type                  | HTML     | Synonyms                                              | Platforms |
|-----------------------|----------|-------------------------------------------------------|-----------|
| `current-location`    | `text`   | current location, where are you based, city           | LV, AB    |
| `preferred-location`  | `text`   | preferred location, work location preference          | WD        |

### 2.8 Referral / Source
| Type                  | HTML       | Synonyms                                                                    | Platforms |
|-----------------------|------------|-----------------------------------------------------------------------------|-----------|
| `referral-source`     | `select`   | how did you hear about us, source, referral source, where did you find     | all       |
| `referrer-name`       | `text`     | referred by, referrer name, employee referral                              | GH, LV    |
| `referrer-email`      | `email`    | referrer email                                                              | GH, LV    |

### 2.9 EEO / Demographics (US-centric, usually optional)
| Type                    | HTML       | Synonyms                                                                                    | Platforms |
|-------------------------|------------|---------------------------------------------------------------------------------------------|-----------|
| `eeo-gender`            | `select`   | gender, gender identity                                                                     | all (US)  |
| `eeo-race`              | `select`   | race, ethnicity, race/ethnicity, hispanic or latino                                         | all (US)  |
| `eeo-veteran`           | `select`   | veteran status, protected veteran                                                           | all (US)  |
| `eeo-disability`        | `select`   | disability, disability status, self-identification of disability                            | all (US)  |
| `eeo-pronoun`           | `select`   | pronouns, preferred pronouns                                                                | GH, AB    |
| `eeo-transgender`       | `select`   | transgender, trans status                                                                   | GH (opt)  |
| `eeo-sexual-orientation`| `select`   | sexual orientation                                                                          | GH (opt)  |
| `eeo-age-range`         | `select`   | age range, age bracket                                                                      | GH (opt)  |

### 2.10 Consent & Legal
| Type                  | HTML       | Synonyms                                                                             | Platforms |
|-----------------------|------------|--------------------------------------------------------------------------------------|-----------|
| `consent-privacy`     | `checkbox` | privacy policy, i agree, gdpr consent, data processing consent, privacy notice      | all (EU)  |
| `consent-marketing`   | `checkbox` | marketing emails, updates, talent pool, future opportunities                        | GH, LV    |
| `consent-background`  | `checkbox` | background check consent                                                            | WD        |
| `age-confirmation`    | `checkbox` | i am 18 or older, age confirmation                                                  | WD        |

### 2.11 Custom / Unclassified
| Type               | HTML                              | Synonyms                                                         | Platforms |
|--------------------|-----------------------------------|------------------------------------------------------------------|-----------|
| `custom-text`      | `text` / `textarea`               | any free-text employer question                                  | all       |
| `custom-choice`    | `select` / `radio` / `checkbox`   | any closed-set employer question                                 | all       |
| `custom-number`    | `number`                          | custom numeric employer question                                 | all       |
| `custom-date`      | `date`                            | custom date employer question                                    | all       |
| `custom-file`      | `file`                            | custom file upload (e.g. writing sample)                         | all       |
| `unknown`          | any                               | classifier failed; operator decides                              | fallback  |

---

## 3. TypeScript Union

```ts
export type FieldType =
  // identity & contact (Mozilla baseline)
  | 'name' | 'given-name' | 'additional-name' | 'family-name'
  | 'honorific-prefix' | 'honorific-suffix' | 'nickname'
  | 'email' | 'tel' | 'tel-country-code' | 'tel-national'
  | 'tel-area-code' | 'tel-local' | 'tel-extension'
  // address
  | 'street-address' | 'address-line1' | 'address-line2' | 'address-line3'
  | 'address-level1' | 'address-level2' | 'address-level3' | 'address-level4'
  | 'postal-code' | 'country' | 'country-name'
  // personal
  | 'bday' | 'bday-day' | 'bday-month' | 'bday-year' | 'sex' | 'language' | 'url'
  // professional links
  | 'linkedin-url' | 'github-url' | 'portfolio-url' | 'personal-website'
  | 'twitter-url' | 'dribbble-url' | 'behance-url' | 'stackoverflow-url'
  // documents
  | 'resume-upload' | 'resume-text'
  | 'cover-letter-upload' | 'cover-letter-text'
  | 'transcript-upload' | 'portfolio-upload' | 'additional-file'
  // current employment
  | 'current-company' | 'current-title' | 'years-experience'
  | 'experience-summary' | 'previous-employer' | 'notice-period'
  // education
  | 'education-level' | 'school-name' | 'field-of-study'
  | 'graduation-year' | 'gpa'
  // work authorization
  | 'work-auth-us' | 'visa-sponsorship-required' | 'work-auth-country'
  | 'citizenship' | 'security-clearance'
  // compensation & availability
  | 'salary-expectation' | 'salary-min' | 'salary-max' | 'salary-currency'
  | 'current-salary' | 'start-date' | 'availability'
  | 'relocation-willing' | 'remote-preference'
  // location
  | 'current-location' | 'preferred-location'
  // referral
  | 'referral-source' | 'referrer-name' | 'referrer-email'
  // EEO
  | 'eeo-gender' | 'eeo-race' | 'eeo-veteran' | 'eeo-disability'
  | 'eeo-pronoun' | 'eeo-transgender' | 'eeo-sexual-orientation' | 'eeo-age-range'
  // consent
  | 'consent-privacy' | 'consent-marketing' | 'consent-background' | 'age-confirmation'
  // custom / fallback
  | 'custom-text' | 'custom-choice' | 'custom-number' | 'custom-date' | 'custom-file'
  | 'unknown';
```

---

## 4. Detection Hint Priority

When classifying a form element, check signals in this order. First confident match wins; otherwise accumulate votes and pick highest score.

1. **`autocomplete` attribute** — trust fully for any standardized token. Highest confidence. (Workday and Ashby frequently set it; Greenhouse rarely does.)
2. **`name` attribute regex** — stable identifier (e.g. `job_application[first_name]` in Greenhouse, `resume` in Lever, `firstName` in Workday).
3. **`id` attribute regex** — second-most stable (e.g. `#first_name`, `#resume-upload-input`).
4. **Associated `<label>` text** — resolved via `for=` attribute or ancestor `<label>` wrap. Highest semantic fidelity but language-dependent.
5. **`placeholder` text** — good signal but often absent or marketing-y.
6. **`aria-label` / `aria-labelledby`** — accessibility-driven, sometimes the only signal on custom React components.
7. **`data-*` attributes** — platform-specific (`data-qa="resume-upload"` on Lever, `data-automation-id="formField-firstName"` on Workday).
8. **Sibling / ancestor heading text** — last resort for orphaned inputs.
9. **Input `type` attribute** — narrows class (`file` disambiguates upload vs text field).
10. **Position heuristics** — last-resort ordering (first text input in application section is usually `given-name`).

Signals 1-3 are deterministic. Signals 4-8 are pattern-based and must run through i18n-aware regex. Signal 9 is a tiebreaker. Signal 10 is fallback only.

---

## 5. Platform Notes

- **Greenhouse** (`boards.greenhouse.io`): `name="job_application[field_id]"` namespacing, custom questions exposed as `question_XXXX_text_value`. Minimal `autocomplete` attributes. EEO is always a distinct section at form bottom.
- **Lever** (`jobs.lever.co`): clean React forms, `name="resume"`, `name="urls[LinkedIn]"`, `data-qa` attributes present. Custom questions in `cards[N]` arrays.
- **Workday** (`*.myworkdayjobs.com`): heavy `data-automation-id="formField-*"` convention. Multi-page workflow (not single form). Accessibility-first; good `aria-label` coverage. Often requires account creation before form exposure.
- **Ashby** (`jobs.ashbyhq.com`): modern React, clean `name` attributes, `data-testid` available, uses native `type="file"` for resume. Typically single-page form.

---

## 6. i18n / Non-ASCII Scope

European Greenhouse boards, Workday tenants in EMEA, and localized Ashby postings render labels in native languages. Examples:

- DE: "Vorname" (given-name), "Nachname" (family-name), "Lebenslauf" (resume), "Anschreiben" (cover letter), "Gehaltsvorstellung" (salary expectation)
- FR: "Prénom", "Nom", "CV", "Lettre de motivation", "Prétentions salariales"
- ES: "Nombre", "Apellido", "Currículum", "Carta de presentación", "Expectativa salarial"
- NL: "Voornaam", "Achternaam", "CV", "Motivatiebrief"
- PT: "Nome", "Sobrenome", "Currículo", "Carta de apresentação"

**v1 scope**: English-only regex dictionaries. Add `i18nLabels: Record<Locale, string[]>` field to each type entry for v2. Detection order stays identical; each locale supplies its own synonym set. Language detection via `<html lang>` attribute with fallback to `navigator.language`. All regexes compiled with Unicode flag `u` and case-insensitive `i` from day one so diacritics do not break matching.

---

## 7. Invariants

- Each `FieldType` maps to exactly one semantic meaning; do not overload.
- Custom fields ALWAYS fall back to `custom-*` rather than `unknown` if the HTML input type is known.
- `unknown` is reserved for true classifier failure and MUST surface to the operator for labeling.
- EEO fields are NEVER auto-filled without explicit user opt-in; they are protected class data.
- Consent checkboxes are NEVER auto-checked; the operator reviews and confirms.
- Detection priority (section 4) is fixed; do not reorder per-platform.

---

**Total field types: 74** (25 Mozilla baseline + 49 ATS-specific including custom/unknown)
