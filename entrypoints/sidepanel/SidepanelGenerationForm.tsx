// SPDX-License-Identifier: MIT
/**
 * SidepanelGenerationForm -- pinned bottom form that mirrors the web app's
 * ChatInterface generation form (src/components/chat/ChatInterface.tsx),
 * sized for the sidepanel. Stays visible at the bottom of the surface at
 * all times (above the footer) so users can always kick off a new
 * generation without scrolling or dismissing an existing session panel.
 *
 * Collapsed state: just a "Start new generation" header strip with a
 *   chevron. Keeps footprint small when the user is reading an existing
 *   session or watching a live stream above.
 *
 * Expanded state:
 *   - job-hunter: Company / Job title / Company website / Job description
 *   - b2b-sales:  Company / Company website
 *   Pre-filled from the detected intent (company, title, JD text) and the
 *   active tab URL (website).
 *
 * Wiring:
 *   - Uses the popup's useGeneration hook (shared) to dispatch
 *     GENERATION_START. On success the sidepanel is already the active
 *     surface so we don't need to open it.
 *   - Emits a GENERATION_STARTED runtime message via the hook's normal
 *     flow, which the surrounding App listens for to dismiss the bound
 *     session panel.
 */

import React, { useMemo, useState } from 'react';
import type { AgentId } from '@/src/background/agents';
import type { DetectedIntent } from '@/src/background/messaging/protocol';
import { useGeneration } from '../popup/useGeneration';
import { Spinner } from '../shared/Spinner';

const INPUT_CLASSES =
  'w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-800 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100';

const LABEL_CLASSES =
  'text-[11px] font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400';

const MAX_SHORT = 200;
const MAX_JD = 40_000;

function ChevronIcon({ open }: { open: boolean }): React.ReactElement {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      aria-hidden="true"
      className={`transition-transform ${open ? 'rotate-180' : ''}`}
    >
      <path
        d="M1 3 L5 7 L9 3"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export interface SidepanelGenerationFormProps {
  readonly activeAgentId: AgentId;
  readonly intent: DetectedIntent | null;
  readonly genericJdText: string | null;
  readonly tabUrl: string | null;
  readonly defaultOpen?: boolean;
}

function deriveDefaults(
  intent: DetectedIntent | null,
  genericJdText: string | null,
  tabUrl: string | null,
): {
  company: string;
  jobTitle: string;
  companyWebsite: string;
  jobDescription: string;
} {
  const company = intent?.company ?? '';
  const jobTitle = intent?.jobTitle ?? '';
  const jobDescription =
    genericJdText ?? (intent?.pageKind === 'job-posting' ? intent.jobTitle ?? '' : '') ?? '';
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

export function SidepanelGenerationForm({
  activeAgentId,
  intent,
  genericJdText,
  tabUrl,
  defaultOpen = false,
}: SidepanelGenerationFormProps): React.ReactElement {
  const [open, setOpen] = useState<boolean>(defaultOpen);
  const { start, busy, error } = useGeneration();

  const defaults = useMemo(
    () => deriveDefaults(intent, genericJdText, tabUrl),
    [intent, genericJdText, tabUrl],
  );
  const [company, setCompany] = useState<string>(defaults.company);
  const [jobTitle, setJobTitle] = useState<string>(defaults.jobTitle);
  const [companyWebsite, setCompanyWebsite] = useState<string>(defaults.companyWebsite);
  const [jobDescription, setJobDescription] = useState<string>(defaults.jobDescription);

  // If the detected intent / tab URL changes and the user hasn't typed
  // anything yet in a field, refresh it. Heuristic: only replace when
  // field equals the *previous* default (i.e. the user never touched it).
  const prevDefaultsRef = React.useRef(defaults);
  React.useEffect(() => {
    const prev = prevDefaultsRef.current;
    if (company === prev.company) setCompany(defaults.company);
    if (jobTitle === prev.jobTitle) setJobTitle(defaults.jobTitle);
    if (companyWebsite === prev.companyWebsite) setCompanyWebsite(defaults.companyWebsite);
    if (jobDescription === prev.jobDescription) setJobDescription(defaults.jobDescription);
    prevDefaultsRef.current = defaults;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaults]);

  const isJobHunter = activeAgentId === 'job-hunter';
  const canSubmit = isJobHunter
    ? jobDescription.trim().length > 0 && company.trim().length > 0
    : companyWebsite.trim().length > 0;

  async function handleSubmit(): Promise<void> {
    if (!canSubmit || busy) return;
    const payload: Record<string, unknown> = isJobHunter
      ? {
          kind: 'job-hunter',
          jobDescription: jobDescription.trim(),
          companyName: company.trim() || undefined,
          jobTitle: jobTitle.trim() || undefined,
          companyWebsite: companyWebsite.trim() || undefined,
        }
      : {
          kind: 'b2b-sales',
          companyName: company.trim() || undefined,
          companyWebsite: companyWebsite.trim(),
        };
    await start({
      agentId: activeAgentId,
      payload,
      tabUrl,
      pageTitle: jobTitle.trim() || company.trim() || null,
    });
  }

  return (
    <section
      data-testid="sidepanel-generation-form"
      data-open={open ? 'true' : 'false'}
      data-agent={activeAgentId}
      className="shrink-0 border-t border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
    >
      <button
        type="button"
        data-testid="sidepanel-generation-form-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-zinc-700 hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-800"
      >
        <span>Start new generation</span>
        <ChevronIcon open={open} />
      </button>
      {open ? (
        <div className="flex flex-col gap-3 border-t border-zinc-100 p-4 dark:border-zinc-800">
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1">
              <span className={LABEL_CLASSES}>
                Company{isJobHunter ? ' *' : ''}
              </span>
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
            {isJobHunter ? (
              <label className="flex flex-col gap-1">
                <span className={LABEL_CLASSES}>Job title</span>
                <input
                  data-testid="sidepanel-form-title"
                  type="text"
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                  maxLength={MAX_SHORT}
                  className={INPUT_CLASSES}
                  placeholder="Backend Engineer"
                />
              </label>
            ) : null}
          </div>
          <label className="flex flex-col gap-1">
            <span className={LABEL_CLASSES}>
              Company website{isJobHunter ? '' : ' *'}
            </span>
            <input
              data-testid="sidepanel-form-website"
              type="url"
              value={companyWebsite}
              onChange={(e) => setCompanyWebsite(e.target.value)}
              maxLength={2048}
              className={INPUT_CLASSES}
              placeholder="https://example.com"
            />
          </label>
          {isJobHunter ? (
            <label className="flex flex-col gap-1">
              <span className={LABEL_CLASSES}>Job description *</span>
              <textarea
                data-testid="sidepanel-form-jd"
                value={jobDescription}
                onChange={(e) => setJobDescription(e.target.value)}
                maxLength={MAX_JD}
                rows={5}
                className={`${INPUT_CLASSES} resize-y`}
                placeholder="Paste the job description here..."
              />
              <span className="text-[10px] text-zinc-400 dark:text-zinc-500">
                {jobDescription.length.toLocaleString()} / {MAX_JD.toLocaleString()}
              </span>
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
          <button
            type="button"
            data-testid="sidepanel-form-submit"
            onClick={() => {
              void handleSubmit();
            }}
            disabled={!canSubmit || busy}
            className="flex w-full items-center justify-center gap-2 rounded-card bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            {busy ? (
              <>
                <Spinner size="sm" inline />
                <span>Starting...</span>
              </>
            ) : isJobHunter ? (
              'Generate CV + Cover Letter'
            ) : (
              'Research company'
            )}
          </button>
        </div>
      ) : null}
    </section>
  );
}
