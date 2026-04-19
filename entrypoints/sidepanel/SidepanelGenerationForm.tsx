// SPDX-License-Identifier: MIT
/**
 * SidepanelGenerationForm -- split into two pieces that share state:
 *
 *   1. <SidepanelGenerationFields /> -- rendered inside the scrollable
 *      content area of the sidepanel (below the bound session + generation
 *      view). Contains mode toggle, inputs, JD textarea, fresh-research
 *      checkbox, inline errors. This IS the form element.
 *
 *   2. <SidepanelGenerationSubmitBar /> -- rendered in the pinned bottom
 *      slot (above SurfaceFooter). Just the Generate button, always
 *      visible. Uses `form="sidepanel-generation-form"` so it submits
 *      the scrollable form even though it lives outside its DOM subtree.
 *
 * Shared state lives in <SidepanelGenerationFormProvider /> at the top of
 * the sidepanel tree so both pieces see the same values.
 *
 * Defaults are derived from both the detected adapter intent AND the
 * generic scan (jsonld / readability). If the ATS adapter miss happens
 * but the generic scan surfaced company / jobTitle (e.g. Greenhouse
 * board page pre-nav), we still pre-fill those fields. This fixes
 * "why isn't company / job title autofilled" on pages where only the
 * generic scan matched.
 *
 * Field-for-field parity with the web's ChatInterface form
 * (e:/llmconveyors.com/src/components/chat/ChatInterface.tsx).
 */

import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { AgentId } from '@/src/background/agents';
import type { DetectedIntent } from '@/src/background/messaging/protocol';
import { useGeneration } from '../popup/useGeneration';
import { Spinner } from '../shared/Spinner';

type Mode = 'standard' | 'cold_outreach';

const FORM_ID = 'sidepanel-generation-form';

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

export interface GenericIntentSeed {
  readonly hasJd: boolean;
  readonly jdText: string | null;
  readonly jobTitle: string | null;
  readonly company: string | null;
}

/**
 * When the sidepanel is showing a bound session (most-recent OR URL-
 * bound), the form below locks its target fields (company / jobTitle /
 * companyWebsite) to that session's metadata. The user can submit to
 * run a fresh generation with the SAME target, or click "Start fresh"
 * to unlock the fields and repoint at a new target from the current
 * tab. This is the "lock website per session" + "visual hint when
 * target differs" pattern discussed with the user.
 */
export interface BoundSessionSeed {
  readonly companyName: string | null;
  readonly jobTitle: string | null;
  readonly urlKey: string | null;
  readonly title: string;
}

export interface SidepanelGenerationFormBase {
  readonly activeAgentId: AgentId;
  readonly intent: DetectedIntent | null;
  readonly genericIntent: GenericIntentSeed | null;
  readonly tabUrl: string | null;
  /** Fallback role title sourced from MASTER_RESUME_GET. */
  readonly resumeJobTitle?: string | null;
  readonly boundSession?: BoundSessionSeed | null;
}

interface Defaults {
  readonly company: string;
  readonly jobTitle: string;
  readonly companyWebsite: string;
  readonly jobDescription: string;
}

function deriveDefaults(
  intent: DetectedIntent | null,
  genericIntent: GenericIntentSeed | null,
  tabUrl: string | null,
  resumeJobTitle: string | null | undefined,
  boundSession: BoundSessionSeed | null | undefined,
  locked: boolean,
): Defaults {
  // When locked, the bound session's metadata wins -- the form is
  // pinned to that target and `Start fresh` is the only way to repoint.
  if (locked && boundSession) {
    const lockedCompany = boundSession.companyName ?? '';
    const lockedTitle = boundSession.jobTitle ?? '';
    let lockedWebsite = '';
    if (boundSession.urlKey !== null && boundSession.urlKey.length > 0) {
      try {
        const u = new URL(boundSession.urlKey);
        lockedWebsite = `${u.protocol}//${u.hostname}`;
      } catch {
        lockedWebsite = '';
      }
    }
    // JD stays current-tab / generic-scan sourced so the user can
    // paste an updated JD without unlocking (cheap edit case).
    const jd =
      (typeof genericIntent?.jdText === 'string' && genericIntent.jdText.length > 0
        ? genericIntent.jdText
        : undefined) ?? '';
    return {
      company: lockedCompany,
      jobTitle: lockedTitle,
      companyWebsite: lockedWebsite,
      jobDescription: jd,
    };
  }
  // Unlocked: prefer adapter-matched values, fall back to generic scan.
  const company =
    (typeof intent?.company === 'string' && intent.company.length > 0
      ? intent.company
      : undefined) ??
    (typeof genericIntent?.company === 'string' && genericIntent.company.length > 0
      ? genericIntent.company
      : undefined) ??
    '';
  const jobTitle =
    (typeof intent?.jobTitle === 'string' && intent.jobTitle.length > 0
      ? intent.jobTitle
      : undefined) ??
    (typeof genericIntent?.jobTitle === 'string' && genericIntent.jobTitle.length > 0
      ? genericIntent.jobTitle
      : undefined) ??
    (typeof resumeJobTitle === 'string' && resumeJobTitle.length > 0
      ? resumeJobTitle
      : undefined) ??
    '';
  const jobDescription =
    (typeof genericIntent?.jdText === 'string' && genericIntent.jdText.length > 0
      ? genericIntent.jdText
      : undefined) ?? '';
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

function hasDetectedJobDescription(
  intent: DetectedIntent | null,
  genericIntent: GenericIntentSeed | null,
  tabUrl: string | null,
): boolean {
  const adapterDetected =
    intent !== null &&
    intent.kind !== 'unknown' &&
    intent.pageKind === 'job-posting' &&
    (() => {
      if (!tabUrl || !intent.url) return true;
      try {
        const intentUrl = new URL(intent.url);
        const currentUrl = new URL(tabUrl);
        // Ignore hash-only drift; require host+path match to avoid stale intent.
        return (
          intentUrl.hostname === currentUrl.hostname &&
          intentUrl.pathname === currentUrl.pathname
        );
      } catch {
        return intent.url === tabUrl;
      }
    })();
  return adapterDetected || genericIntent?.hasJd === true;
}

interface FormState {
  readonly activeAgentId: AgentId;
  readonly mode: Mode;
  readonly company: string;
  readonly jobTitle: string;
  readonly companyWebsite: string;
  readonly jobDescription: string;
  readonly contactName: string;
  readonly contactTitle: string;
  readonly contactEmail: string;
  readonly freshResearch: boolean;
  readonly formErrors: Record<string, string>;
  readonly busy: boolean;
  readonly error: string | null;
  readonly isJobHunter: boolean;
  readonly isColdOutreach: boolean;
  readonly jobDescriptionRequired: boolean;
  readonly submitDisabled: boolean;
  /** True when a bound session is pinning the target fields. */
  readonly locked: boolean;
  /** Bound session title for the banner ("IoT Intern @ Cosysense"). */
  readonly boundTitle: string | null;
  /**
   * True when the form is locked AND the current tab's URL points at
   * something different from the bound session's URL. Powers the hint
   * "You're looking at a different page -- Start fresh to target it".
   */
  readonly targetMismatch: boolean;
  readonly setCompany: (v: string) => void;
  readonly setJobTitle: (v: string) => void;
  readonly setCompanyWebsite: (v: string) => void;
  readonly setJobDescription: (v: string) => void;
  readonly setContactName: (v: string) => void;
  readonly setContactTitle: (v: string) => void;
  readonly setContactEmail: (v: string) => void;
  readonly setFreshResearch: (v: boolean) => void;
  readonly clearFieldError: (name: string) => void;
  readonly toggleMode: () => void;
  /** User-initiated unlock: clears lock + resets fields to current tab. */
  readonly startFresh: () => void;
  readonly onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
}

const GenerationFormContext = createContext<FormState | null>(null);

function useFormState(): FormState {
  const ctx = useContext(GenerationFormContext);
  if (ctx === null) {
    throw new Error(
      'SidepanelGenerationFields / SubmitBar must be rendered inside <SidepanelGenerationFormProvider>',
    );
  }
  return ctx;
}

export function SidepanelGenerationFormProvider({
  activeAgentId,
  intent,
  genericIntent,
  tabUrl,
  resumeJobTitle = null,
  boundSession,
  children,
}: SidepanelGenerationFormBase & {
  readonly children: React.ReactNode;
}): React.ReactElement {
  const { start, busy, error } = useGeneration();
  const isJobHunter = activeAgentId === 'job-hunter';

  // Lock defaults to true whenever a bound session is provided. The
  // user can `Start fresh` to unlock. When they click Start fresh we
  // also remember the sessionId that triggered the unlock so a later
  // render with the same boundSession doesn't re-lock.
  const unlockedSessionIdRef = useRef<string | null>(null);
  const boundKey = boundSession
    ? `${boundSession.urlKey ?? ''}|${boundSession.title}`
    : null;
  const userUnlocked = boundKey !== null && unlockedSessionIdRef.current === boundKey;
  const locked = boundSession !== null && boundSession !== undefined && !userUnlocked;

  const defaults = useMemo(
    () =>
      deriveDefaults(
        intent,
        genericIntent,
        tabUrl,
        resumeJobTitle,
        boundSession ?? null,
        locked,
      ),
    [intent, genericIntent, tabUrl, resumeJobTitle, boundSession, locked],
  );
  const jdDetected = useMemo(
    () => hasDetectedJobDescription(intent, genericIntent, tabUrl),
    [intent, genericIntent, tabUrl],
  );
  const [mode, setMode] = useState<Mode>('standard');
  const [company, setCompany] = useState<string>(defaults.company);
  const [jobTitle, setJobTitle] = useState<string>(defaults.jobTitle);
  const [companyWebsite, setCompanyWebsite] = useState<string>(
    defaults.companyWebsite,
  );
  const [jobDescription, setJobDescription] = useState<string>(
    defaults.jobDescription,
  );
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

  const lastDetectedJdRef = useRef<boolean | null>(null);
  useEffect(() => {
    if (!isJobHunter) return;
    if (lastDetectedJdRef.current === jdDetected) return;
    lastDetectedJdRef.current = jdDetected;
    setMode(jdDetected ? 'standard' : 'cold_outreach');
  }, [isJobHunter, jdDetected]);

  const isColdOutreach = mode === 'cold_outreach';
  const jobDescriptionRequired = !isColdOutreach;

  const clearFieldError = React.useCallback((name: string) => {
    setFormErrors((prev) => {
      if (!prev[name]) return prev;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { [name]: _removed, ...rest } = prev;
      return rest;
    });
  }, []);

  const dumpColdFieldsIntoDescription = (): void => {
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
  };

  const toggleMode = React.useCallback((): void => {
    setMode((current) => {
      const nextMode: Mode = current === 'cold_outreach' ? 'standard' : 'cold_outreach';
      if (current === 'cold_outreach') dumpColdFieldsIntoDescription();
      return nextMode;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contactName, contactTitle, contactEmail]);

  const invalid = isJobHunter
    ? !company.trim() ||
      !jobTitle.trim() ||
      !companyWebsite.trim() ||
      (jobDescriptionRequired && !jobDescription.trim())
    : !companyWebsite.trim();
  const submitDisabled = busy || invalid;

  const boundTitle = boundSession?.title ?? null;
  // Target mismatch: user is on a page whose URL origin differs from
  // the bound session's URL. Powers the in-form hint banner so users
  // realise they're about to re-run for the *locked* target even
  // though they're actually looking at a different page.
  const targetMismatch = useMemo(() => {
    if (!locked || !boundSession || !tabUrl) return false;
    const sessionUrl = boundSession.urlKey;
    if (!sessionUrl) return false;
    try {
      const tabHost = new URL(tabUrl).hostname.replace(/^www\./, '');
      const sessionHost = new URL(sessionUrl).hostname.replace(/^www\./, '');
      return tabHost !== sessionHost;
    } catch {
      return false;
    }
  }, [locked, boundSession, tabUrl]);

  const startFresh = React.useCallback(() => {
    if (boundKey !== null) {
      unlockedSessionIdRef.current = boundKey;
    }
    // Reset fields to current tab defaults. Because unlockedSessionIdRef
    // is a ref, React doesn't know to re-render; flip a state to trigger
    // it. Easiest trick: reset one input to its unlocked default, which
    // forces re-render via setState. The useEffect that tracks defaults
    // re-seeds the rest.
    setCompany('');
    setJobTitle('');
    setCompanyWebsite('');
    setJobDescription('');
    setFormErrors({});
  }, [boundKey]);

  const onSubmit = React.useCallback(
    (event: React.FormEvent<HTMLFormElement>): void => {
      event.preventDefault();
      if (busy) return;
      void (async () => {
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
      })();
    },
    [
      busy,
      isJobHunter,
      company,
      jobTitle,
      companyWebsite,
      jobDescription,
      jobDescriptionRequired,
      mode,
      contactName,
      contactTitle,
      contactEmail,
      freshResearch,
      start,
      tabUrl,
    ],
  );

  const value: FormState = {
    activeAgentId,
    mode,
    company,
    jobTitle,
    companyWebsite,
    jobDescription,
    contactName,
    contactTitle,
    contactEmail,
    freshResearch,
    formErrors,
    busy,
    error,
    isJobHunter,
    isColdOutreach,
    jobDescriptionRequired,
    submitDisabled,
    locked,
    boundTitle,
    targetMismatch,
    setCompany,
    setJobTitle,
    setCompanyWebsite,
    setJobDescription,
    setContactName,
    setContactTitle,
    setContactEmail,
    setFreshResearch,
    clearFieldError,
    toggleMode,
    startFresh,
    onSubmit,
  };
  return (
    <GenerationFormContext.Provider value={value}>
      {children}
    </GenerationFormContext.Provider>
  );
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

function ModeToggle({
  mode,
  onToggle,
  disabled,
}: {
  mode: Mode;
  onToggle: () => void;
  disabled: boolean;
}): React.ReactElement {
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

export function SidepanelGenerationFields(): React.ReactElement {
  const s = useFormState();
  return (
    <section
      data-testid="sidepanel-generation-form"
      data-agent={s.activeAgentId}
      data-mode={s.mode}
      className="bg-white dark:bg-zinc-900"
    >
      <header className="flex items-center justify-between gap-2 border-b border-zinc-100 px-4 py-2 dark:border-zinc-800">
        <div className="flex flex-col">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
            Mode
          </span>
          <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
            {s.isColdOutreach ? 'Cold Outreach' : 'Standard'}
          </span>
        </div>
        {s.locked ? (
          <button
            type="button"
            data-testid="sidepanel-form-start-fresh"
            onClick={s.startFresh}
            disabled={s.busy}
            className="inline-flex items-center gap-1 rounded-pill border border-zinc-300 bg-white px-2.5 py-1 text-[11px] font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
          >
            Start fresh
          </button>
        ) : s.isJobHunter ? (
          <ModeToggle mode={s.mode} onToggle={s.toggleMode} disabled={s.busy} />
        ) : null}
      </header>

      {s.locked ? (
        <div
          data-testid="sidepanel-form-lock-banner"
          data-target-mismatch={s.targetMismatch ? 'true' : 'false'}
          className={`flex items-start gap-2 border-b px-4 py-2 text-[11px] ${
            s.targetMismatch
              ? 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200'
              : 'border-zinc-100 bg-zinc-50 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-800/50 dark:text-zinc-300'
          }`}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            aria-hidden="true"
            className="mt-0.5 shrink-0"
          >
            <rect x="3" y="7" width="10" height="7" rx="1" />
            <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
          </svg>
          <span className="leading-snug">
            {s.targetMismatch ? (
              <>
                Locked to <strong>{s.boundTitle ?? 'this session'}</strong> but
                you&apos;re on a different page now. Click <em>Start fresh</em> to
                target the current page instead.
              </>
            ) : (
              <>
                Target fields locked to <strong>{s.boundTitle ?? 'this session'}</strong>.
                Click <em>Start fresh</em> to edit them.
              </>
            )}
          </span>
        </div>
      ) : null}

      <form
        id={FORM_ID}
        noValidate
        onSubmit={s.onSubmit}
        data-testid="sidepanel-generation-form-root"
        className="flex flex-col gap-3 p-4"
      >
        {s.isJobHunter ? (
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1">
              <span className={LABEL_CLASSES}>
                Company <span className="text-red-500">*</span>
              </span>
              <input
                data-testid="sidepanel-form-company"
                type="text"
                value={s.company}
                onChange={(e) => {
                  s.clearFieldError('companyName');
                  s.setCompany(e.target.value);
                }}
                maxLength={MAX_SHORT}
                readOnly={s.locked}
                aria-readonly={s.locked || undefined}
                className={`${INPUT_CLASSES} ${s.locked ? 'cursor-not-allowed opacity-75' : ''}`}
                placeholder="Acme Inc"
              />
              <FieldError message={s.formErrors.companyName} />
            </label>
            <label className="flex flex-col gap-1">
              <span className={LABEL_CLASSES}>
                Job title <span className="text-red-500">*</span>
              </span>
              <input
                data-testid="sidepanel-form-title"
                type="text"
                value={s.jobTitle}
                onChange={(e) => {
                  s.clearFieldError('jobTitle');
                  s.setJobTitle(e.target.value);
                }}
                maxLength={MAX_SHORT}
                readOnly={s.locked}
                aria-readonly={s.locked || undefined}
                className={`${INPUT_CLASSES} ${s.locked ? 'cursor-not-allowed opacity-75' : ''}`}
                placeholder="Backend Engineer"
              />
              <FieldError message={s.formErrors.jobTitle} />
            </label>
          </div>
        ) : (
          <label className="flex flex-col gap-1">
            <span className={LABEL_CLASSES}>Company</span>
            <input
              data-testid="sidepanel-form-company"
              type="text"
              value={s.company}
              onChange={(e) => s.setCompany(e.target.value)}
              maxLength={MAX_SHORT}
              readOnly={s.locked}
              aria-readonly={s.locked || undefined}
              className={`${INPUT_CLASSES} ${s.locked ? 'cursor-not-allowed opacity-75' : ''}`}
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
            value={s.companyWebsite}
            onChange={(e) => {
              s.clearFieldError('companyWebsite');
              s.setCompanyWebsite(normalizeUrl(e.target.value));
            }}
            maxLength={2048}
            readOnly={s.locked}
            aria-readonly={s.locked || undefined}
            className={`${INPUT_CLASSES} ${s.locked ? 'cursor-not-allowed opacity-75' : ''}`}
            placeholder="https://example.com"
          />
          <FieldError message={s.formErrors.companyWebsite} />
        </label>

        {s.isJobHunter && s.isColdOutreach ? (
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1">
              <span className={LABEL_CLASSES}>Contact name</span>
              <input
                data-testid="sidepanel-form-contact-name"
                type="text"
                value={s.contactName}
                onChange={(e) => s.setContactName(e.target.value)}
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
                value={s.contactTitle}
                onChange={(e) => s.setContactTitle(e.target.value)}
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
                value={s.contactEmail}
                onChange={(e) => s.setContactEmail(normalizeUrl(e.target.value))}
                maxLength={MAX_EMAIL}
                className={INPUT_CLASSES}
                placeholder="jane@example.com"
              />
            </label>
          </div>
        ) : null}

        {s.isJobHunter ? (
          <label className="flex flex-col gap-1">
            <span className={LABEL_CLASSES}>
              Job description{s.jobDescriptionRequired ? ' *' : ''}
            </span>
            <textarea
              data-testid="sidepanel-form-jd"
              value={s.jobDescription}
              onChange={(e) => {
                s.clearFieldError('jobDescription');
                s.setJobDescription(e.target.value);
              }}
              maxLength={MAX_JD}
              rows={5}
              className={`${INPUT_CLASSES} resize-y`}
              placeholder={
                s.isColdOutreach
                  ? 'Paste context about the target or outreach goal...'
                  : 'Paste the job description here...'
              }
            />
            <div className="flex items-center justify-between">
              <FieldError message={s.formErrors.jobDescription} />
              <span className="ml-auto text-[10px] text-zinc-400 dark:text-zinc-500">
                {s.jobDescription.length.toLocaleString()} / {MAX_JD.toLocaleString()}
              </span>
            </div>
          </label>
        ) : null}

        {s.error !== null ? (
          <p
            data-testid="sidepanel-form-error"
            className="rounded-card bg-red-50 px-3 py-1.5 text-xs text-red-800 dark:bg-red-900/40 dark:text-red-100"
          >
            {s.error}
          </p>
        ) : null}

        <label className="flex cursor-pointer select-none items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
          <input
            data-testid="sidepanel-form-fresh-research"
            type="checkbox"
            checked={s.freshResearch}
            onChange={(e) => s.setFreshResearch(e.target.checked)}
            disabled={s.busy}
            className="h-3.5 w-3.5 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-500 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-100"
          />
          <span>Fresh research</span>
        </label>
      </form>
    </section>
  );
}

/**
 * Pinned submit bar. Uses `form={FORM_ID}` so the button submits the
 * <form> in SidepanelGenerationFields even though the two live in
 * different DOM subtrees.
 */
export function SidepanelGenerationSubmitBar(): React.ReactElement {
  const s = useFormState();
  return (
    <div
      data-testid="sidepanel-generation-submit-bar"
      className="shrink-0 border-t border-zinc-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900"
    >
      <button
        type="submit"
        form={FORM_ID}
        data-testid="sidepanel-form-submit"
        disabled={s.submitDisabled}
        className="flex w-full items-center justify-center gap-2 rounded-card bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
      >
        {s.busy ? (
          <>
            <Spinner size="sm" inline />
            <span>Starting...</span>
          </>
        ) : s.isJobHunter ? (
          'Generate'
        ) : (
          'Research'
        )}
      </button>
    </div>
  );
}

/**
 * Back-compat: the earlier monolithic component still exists for callers
 * that don't want to split rendering across two slots. Internally it
 * composes Provider + Fields + SubmitBar in one section.
 */
export function SidepanelGenerationForm(
  props: SidepanelGenerationFormBase,
): React.ReactElement {
  return (
    <SidepanelGenerationFormProvider {...props}>
      <SidepanelGenerationFields />
      <SidepanelGenerationSubmitBar />
    </SidepanelGenerationFormProvider>
  );
}
