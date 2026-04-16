// SPDX-License-Identifier: MIT
/**
 * SidepanelGenerationForm -- direct port of the web app's ChatInterface
 * generation form (e:/llmconveyors.com/src/components/chat/ChatInterface.tsx),
 * sized for the 360-400px sidepanel. Always visible and pinned at the bottom
 * of the sidepanel; the form is the form -- not a toggle that opens a form.
 *
 * Field-for-field parity with the web:
 *   - Mode toggle: Standard / Cold Outreach (fire / snowflake pill).
 *   - Company name (required, max 200).
 *   - Job title (required, max 200).
 *   - Company website (required, url, normalized lowercase-no-spaces).
 *   - Cold-outreach only: Contact Name, Title, Email (each max 200/320).
 *   - Job description textarea (required in standard, optional in cold;
 *     max 40_000 chars; live char counter).
 *   - Action bar: Fresh-research checkbox + Generate button.
 *     Generate is disabled when required fields are empty OR while busy.
 *   - When switching cold -> standard the cold contact fields are folded
 *     into the JD as "Additional outreach context" like the web app does.
 *
 * Wiring:
 *   - Pre-fills from detected intent + active tab URL; fields the user has
 *     edited are preserved across intent updates.
 *   - Submits via useGeneration().start -> GENERATION_START.
 */

import React, { useMemo, useRef, useState, useEffect } from 'react';
import type { AgentId } from '@/src/background/agents';
import type { DetectedIntent } from '@/src/background/messaging/protocol';
import { useGeneration } from '../popup/useGeneration';
import { Spinner } from '../shared/Spinner';

type Mode = 'standard' | 'cold_outreach';

const INPUT_CLASSES =
  'w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-800 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100';

const LABEL_CLASSES =
  'text-[11px] font-semibold text-zinc-600 dark:text-zinc-400';

const MAX_SHORT = 200;
const MAX_EMAIL = 320;
const MAX_JD = 40_000;

function normalizeUrl(value: string): string {
  return value.replace(/\s+/g, '').toLowerCase();
}

export interface SidepanelGenerationFormProps {
  readonly activeAgentId: AgentId;
  readonly intent: DetectedIntent | null;
  readonly genericJdText: string | null;
  readonly tabUrl: string | null;
  /** Ignored (kept for back-compat with earlier call sites). */
  readonly defaultOpen?: boolean;
}

interface Defaults {
  company: string;
  jobTitle: string;
  companyWebsite: string;
  jobDescription: string;
}

function deriveDefaults(
  intent: DetectedIntent | null,
  genericJdText: string | null,
  tabUrl: string | null,
): Defaults {
  const company = intent?.company ?? '';
  const jobTitle = intent?.jobTitle ?? '';
  const jobDescription = genericJdText ?? '';
  let companyWebsite = '';
  if (tabUrl !== null) {
    try {
      const u = new URL(tabUrl);
      companyWebsite = `${u.protocol}//${u.hostname}`;
    } catch {
      companyWebsite = '';
    }
  }
  return { company, jobTitle, companyWebsite, jobDescription };
}

function FireIcon(): React.ReactElement {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 1.5s-3 3-3 6a3 3 0 0 0 6 0 3 3 0 0 0-.5-1.7c0 1.1-.9 2-2 2s-2-.9-2-2c0-1.5 1.5-4.3 1.5-4.3Z" />
    </svg>
  );
}

function SnowflakeIcon(): React.ReactElement {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
      <path d="M8 2v12M2 8h12M4 4l8 8M12 4l-8 8" />
    </svg>
  );
}

function ModeToggle({ mode, onToggle, disabled }: { mode: Mode; onToggle: () => void; disabled: boolean }): React.ReactElement {
  const isCold = mode === 'cold_outreach';
  return (
    <button
      type="button"
      data-testid="sidepanel-form-mode-toggle"
      onClick={onToggle}
      aria-pressed={isCold}
      disabled={disabled}
      className={`relative inline-flex h-8 w-20 shrink-0 items-center overflow-hidden rounded-full p-0.5 text-xs font-semibold text-white transition disabled:opacity-50 ${
        isCold
          ? 'bg-gradient-to-r from-indigo-400 via-purple-500 to-violet-500'
          : 'bg-gradient-to-r from-orange-400 via-rose-500 to-pink-500'
      }`}
    >
      <span className="sr-only">Toggle cold outreach mode</span>
      <div className="relative flex h-7 w-full items-center justify-between px-1">
        <span className={`relative z-10 flex h-6 w-6 items-center justify-center rounded-full ${isCold ? 'text-white/60' : 'bg-white text-orange-500'}`}>
          <FireIcon />
        </span>
        <span className={`relative z-10 flex h-6 w-6 items-center justify-center rounded-full ${isCold ? 'bg-white text-sky-600' : 'text-white/70'}`}>
          <SnowflakeIcon />
        </span>
        <span
          aria-hidden="true"
          className={`absolute left-0.5 top-0.5 z-0 h-6 w-8 rounded-full bg-white shadow transition-transform duration-300 ${isCold ? 'translate-x-9' : 'translate-x-0'}`}
        />
      </div>
    </button>
  );
}

function FieldError({ message }: { message: string | undefined }): React.ReactElement | null {
  if (!message) return null;
  return (
    <p role="alert" className="text-[10px] text-red-600 dark:text-red-400">
      {message}
    </p>
  );
}

export function SidepanelGenerationForm({
  activeAgentId,
  intent,
  genericJdText,
  tabUrl,
}: SidepanelGenerationFormProps): React.ReactElement {
  const { start, busy, error } = useGeneration();
  const isJobHunter = activeAgentId === 'job-hunter';

  // B2B sales keeps its own lean form (company + website only). The full
  // Next.js form below is for job-hunter. Rendering the lean variant
  // inline keeps the pinned section consistent across agents.
  const defaults = useMemo(
    () => deriveDefaults(intent, genericJdText, tabUrl),
    [intent, genericJdText, tabUrl],
  );

  const [mode, setMode] = useState<Mode>('standard');
  const [company, setCompany] = useState<string>(defaults.company);
  const [jobTitle, setJobTitle] = useState<string>(defaults.jobTitle);
  const [companyWebsite, setCompanyWebsite] = useState<string>(defaults.companyWebsite);
  const [jobDescription, setJobDescription] = useState<string>(defaults.jobDescription);
  const [contactName, setContactName] = useState<string>('');
  const [contactTitle, setContactTitle] = useState<string>('');
  const [contactEmail, setContactEmail] = useState<string>('');
  const [freshResearch, setFreshResearch] = useState<boolean>(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const prevDefaultsRef = useRef(defaults);
  useEffect(() => {
    const prev = prevDefaultsRef.current;
    if (company === prev.company) setCompany(defaults.company);
    if (jobTitle === prev.jobTitle) setJobTitle(defaults.jobTitle);
    if (companyWebsite === prev.companyWebsite) setCompanyWebsite(defaults.companyWebsite);
    if (jobDescription === prev.jobDescription) setJobDescription(defaults.jobDescription);
    prevDefaultsRef.current = defaults;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaults]);

  const isColdOutreach = mode === 'cold_outreach';
  const jobDescriptionRequired = !isColdOutreach;

  function clearFieldError(name: string): void {
    setFormErrors((prev) => {
      if (!prev[name]) return prev;
      const { [name]: _removed, ...rest } = prev;
      return rest;
    });
  }

  function dumpColdFieldsIntoDescription(): void {
    const lines: string[] = [];
    const n = contactName.trim();
    const tt = contactTitle.trim();
    const em = contactEmail.trim();
    if (n) lines.push(`Contact: ${n}${tt ? ` (${tt})` : ''}`);
    if (em) lines.push(`Contact email: ${em}`);
    if (lines.length === 0) return;
    setJobDescription((prev) => {
      const segment = `Additional outreach context:\n${lines.join('\n')}`;
      return prev ? `${prev.trim()}\n\n${segment}` : segment;
    });
    setContactName('');
    setContactTitle('');
    setContactEmail('');
  }

  function toggleMode(): void {
    const next: Mode = isColdOutreach ? 'standard' : 'cold_outreach';
    if (isColdOutreach) dumpColdFieldsIntoDescription();
    setMode(next);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (busy) return;
    if (isJobHunter) {
      const errors: Record<string, string> = {};
      if (!company.trim()) errors.companyName = 'Company is required';
      if (!jobTitle.trim()) errors.jobTitle = 'Job title is required';
      if (!companyWebsite.trim()) errors.companyWebsite = 'Company website is required';
      if (jobDescriptionRequired && !jobDescription.trim()) {
        errors.jobDescription = 'Job description is required';
      }
      if (Object.keys(errors).length > 0) {
        setFormErrors(errors);
        return;
      }
      setFormErrors({});
      await start({
        agentId: 'job-hunter',
        payload: {
          kind: 'job-hunter',
          mode,
          jobDescription: jobDescription.trim(),
          companyName: company.trim(),
          jobTitle: jobTitle.trim(),
          companyWebsite: companyWebsite.trim(),
          contactName: contactName.trim() || undefined,
          contactTitle: contactTitle.trim() || undefined,
          contactEmail: contactEmail.trim() || undefined,
          skipResearchCache: freshResearch || undefined,
        },
        tabUrl,
        pageTitle: jobTitle.trim() || company.trim() || null,
      });
    } else {
      const errors: Record<string, string> = {};
      if (!companyWebsite.trim()) errors.companyWebsite = 'Company website is required';
      if (Object.keys(errors).length > 0) {
        setFormErrors(errors);
        return;
      }
      setFormErrors({});
      await start({
        agentId: 'b2b-sales',
        payload: {
          kind: 'b2b-sales',
          companyName: company.trim() || undefined,
          companyWebsite: companyWebsite.trim(),
          skipResearchCache: freshResearch || undefined,
        },
        tabUrl,
        pageTitle: company.trim() || null,
      });
    }
  }

  // Disabled mirrors ChatInterface: busy OR any required field empty.
  const invalid = isJobHunter
    ? !company.trim() ||
      !jobTitle.trim() ||
      !companyWebsite.trim() ||
      (jobDescriptionRequired && !jobDescription.trim())
    : !companyWebsite.trim();
  const submitDisabled = busy || invalid;

  return (
    <section
      data-testid="sidepanel-generation-form"
      data-open="true"
      data-agent={activeAgentId}
      data-mode={mode}
      className="shrink-0 border-t border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
    >
      <header className="flex items-center justify-between gap-2 border-b border-zinc-100 px-4 py-2 dark:border-zinc-800">
        <div className="flex flex-col">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
            Mode
          </span>
          <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
            {isColdOutreach ? 'Cold Outreach' : 'Standard'}
          </span>
        </div>
        {isJobHunter ? (
          <ModeToggle mode={mode} onToggle={toggleMode} disabled={busy} />
        ) : null}
      </header>

      <form
        noValidate
        onSubmit={(e) => {
          void handleSubmit(e);
        }}
        data-testid="sidepanel-generation-form-root"
        className="flex max-h-[360px] flex-col gap-3 overflow-y-auto p-4"
      >
        {isJobHunter ? (
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1">
              <span className={LABEL_CLASSES}>
                Company <span className="text-red-500">*</span>
              </span>
              <input
                data-testid="sidepanel-form-company"
                type="text"
                value={company}
                onChange={(e) => {
                  clearFieldError('companyName');
                  setCompany(e.target.value);
                }}
                maxLength={MAX_SHORT}
                className={INPUT_CLASSES}
                placeholder="Acme Inc"
              />
              <FieldError message={formErrors.companyName} />
            </label>
            <label className="flex flex-col gap-1">
              <span className={LABEL_CLASSES}>
                Job title <span className="text-red-500">*</span>
              </span>
              <input
                data-testid="sidepanel-form-title"
                type="text"
                value={jobTitle}
                onChange={(e) => {
                  clearFieldError('jobTitle');
                  setJobTitle(e.target.value);
                }}
                maxLength={MAX_SHORT}
                className={INPUT_CLASSES}
                placeholder="Backend Engineer"
              />
              <FieldError message={formErrors.jobTitle} />
            </label>
          </div>
        ) : (
          <label className="flex flex-col gap-1">
            <span className={LABEL_CLASSES}>Company</span>
            <input
              data-testid="sidepanel-form-company"
              type="text"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              maxLength={MAX_SHORT}
              className={INPUT_CLASSES}
              placeholder="Acme Inc"
            />
          </label>
        )}

        <label className="flex flex-col gap-1">
          <span className={LABEL_CLASSES}>
            Company website <span className="text-red-500">*</span>
          </span>
          <input
            data-testid="sidepanel-form-website"
            type="url"
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={companyWebsite}
            onChange={(e) => {
              clearFieldError('companyWebsite');
              setCompanyWebsite(normalizeUrl(e.target.value));
            }}
            maxLength={2048}
            className={INPUT_CLASSES}
            placeholder="https://example.com"
          />
          <FieldError message={formErrors.companyWebsite} />
        </label>

        {isJobHunter && isColdOutreach ? (
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1">
              <span className={LABEL_CLASSES}>Contact name</span>
              <input
                data-testid="sidepanel-form-contact-name"
                type="text"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                maxLength={MAX_SHORT}
                className={INPUT_CLASSES}
                placeholder="Jane Smith"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className={LABEL_CLASSES}>Contact title</span>
              <input
                data-testid="sidepanel-form-contact-title"
                type="text"
                value={contactTitle}
                onChange={(e) => setContactTitle(e.target.value)}
                maxLength={MAX_SHORT}
                className={INPUT_CLASSES}
                placeholder="Head of Engineering"
              />
            </label>
            <label className="col-span-2 flex flex-col gap-1">
              <span className={LABEL_CLASSES}>Contact email</span>
              <input
                data-testid="sidepanel-form-contact-email"
                type="email"
                inputMode="email"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={contactEmail}
                onChange={(e) => setContactEmail(normalizeUrl(e.target.value))}
                maxLength={MAX_EMAIL}
                className={INPUT_CLASSES}
                placeholder="jane@example.com"
              />
            </label>
          </div>
        ) : null}

        {isJobHunter ? (
          <label className="flex flex-col gap-1">
            <span className={LABEL_CLASSES}>
              Job description{jobDescriptionRequired ? ' *' : ''}
            </span>
            <textarea
              data-testid="sidepanel-form-jd"
              value={jobDescription}
              onChange={(e) => {
                clearFieldError('jobDescription');
                setJobDescription(e.target.value);
              }}
              maxLength={MAX_JD}
              rows={5}
              className={`${INPUT_CLASSES} resize-y`}
              placeholder={
                isColdOutreach
                  ? 'Paste context about the target or outreach goal...'
                  : 'Paste the job description here...'
              }
            />
            <div className="flex items-center justify-between">
              <FieldError message={formErrors.jobDescription} />
              <span className="ml-auto text-[10px] text-zinc-400 dark:text-zinc-500">
                {jobDescription.length.toLocaleString()} / {MAX_JD.toLocaleString()}
              </span>
            </div>
          </label>
        ) : null}

        {error !== null ? (
          <p
            data-testid="sidepanel-form-error"
            className="rounded-card bg-red-50 px-3 py-1.5 text-xs text-red-800 dark:bg-red-900/40 dark:text-red-100"
          >
            {error}
          </p>
        ) : null}

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-zinc-500 dark:text-zinc-400">
          <label className="flex cursor-pointer select-none items-center gap-1.5">
            <input
              data-testid="sidepanel-form-fresh-research"
              type="checkbox"
              checked={freshResearch}
              onChange={(e) => setFreshResearch(e.target.checked)}
              disabled={busy}
              className="h-3.5 w-3.5 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-500 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-100"
            />
            <span>Fresh research</span>
          </label>
          <button
            type="submit"
            data-testid="sidepanel-form-submit"
            disabled={submitDisabled}
            className="ml-auto inline-flex items-center justify-center gap-2 rounded-card bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            {busy ? (
              <>
                <Spinner size="sm" inline />
                <span>Starting...</span>
              </>
            ) : isJobHunter ? (
              'Generate'
            ) : (
              'Research'
            )}
          </button>
        </div>
      </form>
    </section>
  );
}
