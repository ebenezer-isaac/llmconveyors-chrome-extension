# Agent 62 — AIHawk Selector & Schema Extraction

**Repo:** `feder-cr/Jobs_Applier_AI_Agent_AIHawk` (cloned `/e/scratch/aihawk`, depth 1)
**Verdict:** REFERENCE ONLY (license-blocked) + **critical finding: no LinkedIn selectors in this fork**

## a) License + Extraction Eligibility

**LICENSE: GNU AGPL v3** (`/e/scratch/aihawk/LICENSE`, copyright 2024 AI Hawk FOSS).

AGPL is viral and also extends to network interaction. Any code we copy, translate, or even closely port would force our entire extension + backend into AGPL. **Hard block on code extraction.** We may read it for ideas, schema validation, and prompt-engineering inspiration — we may not translate functions, selectors, or prompt templates verbatim into our codebase. All derived artifacts must be independently re-expressed.

## b) Directory Structure

```
aihawk/
├── LICENSE                    # AGPL-3.0
├── main.py                    # CLI entry
├── config.py                  # runtime constants
├── assets/resume_schema.yaml  # JSON-schema of the YAML resume
├── data_folder_example/
│   ├── plain_text_resume.yaml # user profile (141 lines)
│   ├── work_preferences.yaml  # job search filters (48 lines)
│   └── secrets.yaml           # LLM API keys
└── src/
    ├── job.py, jobContext.py, job_application_saver.py
    ├── resume_schemas/
    │   ├── job_application_profile.py  # dataclasses: SelfId, LegalAuth, WorkPref, Availability, Salary
    │   └── resume.py
    ├── libs/
    │   ├── llm_manager.py              # 709 LOC — the Q&A brain
    │   └── resume_and_cover_builder/   # Jinja/CSS resume renderer
    └── utils/chrome_utils.py           # launches headless Chrome ONLY to render resume HTML → PDF
```

## c) Critical Finding: No LinkedIn Easy Apply Code Here

`grep -ri "easy_apply\|find_element\|By.XPATH"` returns **zero hits**. Selenium is imported only in `src/utils/chrome_utils.py` and `src/libs/resume_and_cover_builder/resume_facade.py` to screenshot/print the generated resume HTML to PDF (`driver.find_element("tag name", "body")`).

This repo is the **resume-and-cover-letter generator fork**; the LinkedIn bot was split into a separate project (`AIHawk-FOSS/Auto_Jobs_Applier_AI_Agent` / `AIHawk-FOSS/AIHawk`) that has since been taken down / made private, likely due to LinkedIn TOS pressure. **No LinkedIn selector reference is available in this tree.** For V2 LinkedIn adapter, we will have to build selectors from scratch by observing live DOM — there is no OSS reference left.

## d) Profile YAML Schema (complete field inventory)

Source: `data_folder_example/plain_text_resume.yaml` (141 lines), `work_preferences.yaml`, and the Python dataclasses in `src/resume_schemas/job_application_profile.py`.

**Top-level sections:**
1. `personal_information` — name, surname, date_of_birth, country, city, zip_code, address, phone_prefix, phone, email, github, linkedin
2. `education_details[]` — education_level, institution, field_of_study, final_evaluation_grade, year_of_completion, start_date, additional_info.exam (map of course→grade)
3. `experience_details[]` — position, company, employment_period, location, industry, key_responsibilities[] (list of `{responsibility}`), skills_acquired[]
4. `projects[]` — name, description, link
5. `achievements[]` — name, description
6. `certifications[]` — name, description
7. `languages[]` — language, proficiency (Fluent/Intermediate/Basic)
8. `interests[]` — flat strings
9. `availability.notice_period` — free text
10. `salary_expectations.salary_range_usd` — free text
11. `self_identification` — gender, pronouns, veteran, disability, ethnicity
12. `legal_authorization` — 16 flags covering US/EU/UK/Canada × {work_authorization, requires_visa, requires_sponsorship, legally_allowed_to_work}
13. `work_preferences` — remote_work, in_person_work, open_to_relocation, willing_to_complete_assessments, willing_to_undergo_drug_tests, willing_to_undergo_background_checks

**Separate `work_preferences.yaml`** (job search criteria, not profile):
- `remote`/`hybrid`/`onsite` bools
- `experience_level` — internship/entry/associate/mid_senior_level/director/executive
- `job_types` — full_time/contract/part_time/temporary/internship/other/volunteer
- `date` window — all_time/month/week/24_hours
- `positions[]`, `locations[]`, `distance`, `apply_once_at_company`
- `company_blacklist[]`, `title_blacklist[]`, `location_blacklist[]`

**Comparison to Agent 46 taxonomy — fields we likely missed:**
- `phone_prefix` (separate from `phone`) — many ATS forms split country-code from number
- `legal_authorization` is **16 explicit flags per jurisdiction**, not a single boolean. Our schema should model this as a `jurisdictionAuthorization: Record<'US'|'EU'|'UK'|'CA', { authorized, requiresVisa, requiresSponsorship, legallyAllowed }>` — form questions phrase this every possible way.
- `willing_to_undergo_{drug_tests, background_checks}` + `willing_to_complete_assessments` — three distinct flags, ATS forms ask these separately
- `education_details.additional_info.exam` (course-level grades) — niche but used by academic/consulting forms
- `employment_period` as single string (`"06/2019 - Present"`) vs `startDate`/`endDate` — worth normalizing but accept both
- `achievements[]` as distinct from `certifications[]`
- `apply_once_at_company` and three blacklists — belong in a separate `preferences` namespace, not profile

**Fields they have that we can drop / flag as sensitive:**
- `date_of_birth` — GDPR/ADEA risk, should be opt-in, never auto-filled unless user explicitly enables
- `ethnicity`, `gender`, `pronouns`, `veteran`, `disability` — EEO fields, must be gated behind explicit user consent and only submitted to known-safe "voluntary self-ID" sections

## e) "Unknown Question" Handling (directly relevant to our enrichment layer)

In `src/libs/llm_manager.py` (AGPL — described, not copied):

**Three-path classifier** (`GPTAnswerer` class, ~L526–670):

1. **`answer_question_textual_wide_range(question)`** — freeform text. Two-stage LLM call:
   - Stage 1: classify the question into one of 13 resume sections using `determine_section_template` — returns section name via regex match
   - Stage 2: route to a section-specific chain (`personal_information_template`, `self_identification_template`, `legal_authorization_template`, `work_preferences_template`, `education_details_template`, `experience_details_template`, `projects_template`, `availability_template`, `salary_expectations_template`, `certifications_template`, `languages_template`, `interests_template`, `coverletter_template`) and invoke it with the matching resume slice (`getattr(self.resume, section_name)`) plus the original question
   - Special case: `cover_letter` section gets full resume + job_description + company
2. **`answer_question_numeric(question, default_experience=3)`** — prompts LLM with educations+jobs+projects, regex-extracts the first integer from the response, falls back to `default_experience=3` on parse failure. This is their "years of X" handler.
3. **`answer_question_from_options(question, options[])`** — prompts LLM with resume + profile + question + options list, then runs `find_best_match(raw_output, options)` (fuzzy matching via `difflib`-style) to snap the LLM's freeform reply back onto a valid dropdown/radio option.

**Pattern to steal (conceptually, not code):**
- Route questions by **answer type** (text / numeric / enum) before routing by **semantic section**. This is the right decomposition for our API-layered enrichment.
- Always have a **snap-to-valid-option** layer for enum answers — LLMs will return "Yes, absolutely" when the valid options are `["Yes","No"]`.
- Always have a **numeric default fallback** — LLMs give essays when asked "how many years". Regex + default is the resilient play.
- Section classifier is a small cheap-LLM call; answer generation uses the same cheap LLM but with a focused slice of resume. **Cost-efficient** — we can replicate with Flash.

**Caching/answer-bank:** there is **no pre-filled answer bank and no persistent cache** of previously-answered questions. Every question goes through an LLM call on every application. This is a weakness — we should cache `(question_embedding, answer)` pairs per user to avoid re-paying LLM cost for the 80% of repeat questions across applications.

## f) Cross-ATS Patterns

**None in this fork.** The repo is LinkedIn-only in its original form, and this fork strips even that. No Greenhouse / Lever / Workday / Taleo / SmartRecruiters adapters, no abstract `ATSAdapter` base class, no selector maps. The architecture assumption baked into `llm_manager.py` is that the caller hands it a `question: str` + `options: list[str]` — i.e. the ATS integration layer is a black box not represented in this codebase.

**Implication:** AIHawk validates our architecture (LLM Q&A layer decoupled from DOM layer) but provides **zero help** on the DOM layer itself. The Greenhouse/Lever/Workday selector work is 100% greenfield for us — confirmed across agents 46, 62, and (likely) the other OSS scans.

## Verdict

**REFERENCE ONLY.** AGPL-3.0 blocks any code reuse. The LinkedIn selectors we hoped to find **do not exist in this fork** (removed upstream). What we get is:

1. **Validated profile schema** — 13 sections, 16 legal-auth flags, separate job-search preferences. Our TypeScript schema should add `phone_prefix`, expand `legal_authorization` to a per-jurisdiction 4-flag matrix, add the three `willing_to_undergo_*` flags, and gate DOB + EEO fields behind explicit consent.
2. **Validated Q&A architecture** — route by answer-type (text/numeric/enum) then by semantic section, snap enum answers to valid options, numeric fallback with regex + default. Build this ourselves from scratch with our Flash pipeline.
3. **Caching gap to exploit** — AIHawk has no answer bank; we can differentiate by embedding-keyed per-user answer cache.
4. **Confirmation that no OSS LinkedIn Easy Apply reference exists** for V2 planning — we must build selectors from live-DOM observation.

**Confidence: 92%**
Filename: `e:\llmconveyors.com\temp\impl\100-chrome-extension-mvp\investigation\62-aihawk-selector-extraction.md`
