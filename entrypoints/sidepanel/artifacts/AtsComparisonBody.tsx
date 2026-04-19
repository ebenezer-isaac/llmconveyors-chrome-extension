// SPDX-License-Identifier: MIT
/**
 * AtsComparisonBody -- sidepanel port of the web app's flagship
 * AtsComparisonCard (src/components/chat/artifacts/AtsComparisonCard.tsx).
 *
 * Mirrors the rendering hierarchy without the web-only features (share
 * modal, rerun button, version switcher):
 *   - Side-by-side Before / After / Change scores with grade colour.
 *   - Breakdown rows: keyword match, experience, skills, education, format.
 *   - AI Reasoning block (after.reasoning).
 *   - Added keywords chips (green) + Still-missing chips (red).
 *   - Confidence distribution bar (strong / moderate / weak / missing).
 *   - Collapsible Enriched Missing Keywords (with priority + guidance).
 *   - Collapsible Domain Intelligence (default open).
 *   - Collapsible Improvement Suggestions (default open, enriched) with
 *     priority + target-section badges + estimated score impact.
 *   - Basic Suggestions fallback (plain string list).
 *   - Collapsible Semantic Equivalences.
 *   - Collapsible Matched Keywords with context / synonym / confidence.
 *
 * Types are local to avoid depending on the web repo's @repo/shared-types
 * build output; shapes are pinned to the production AtsScoreResultSchema.
 */

import React, { useMemo, useState } from 'react';
import type { ArtifactPreview } from '@/src/background/messaging/schemas/artifact-preview.schema';

type Priority = 'high' | 'medium' | 'low' | 'required' | 'preferred';
type DomainDistance = 'same' | 'adjacent' | 'moderate' | 'distant';

interface AtsBreakdown {
  readonly keywordMatch: number;
  readonly experienceRelevance: number;
  readonly skillsCoverage: number;
  readonly educationFit: number;
  readonly formatQuality: number;
}

interface KeywordMatch {
  readonly keyword: string;
  readonly synonymUsed?: string;
  readonly context?: string;
  readonly confidence?: number;
  readonly matchChannel?: string;
}

interface KeywordConfidence {
  readonly keyword: string;
  readonly confidence: number;
  readonly priority: string;
}

interface EnrichedSuggestion {
  readonly text: string;
  readonly priority: Priority;
  readonly targetSection: string;
  readonly estimatedScoreImpact: number;
}

interface EnrichedMissingKeyword {
  readonly keyword: string;
  readonly priority: Priority;
  readonly suggestedSection: string;
  readonly additionGuidance: string;
  readonly semanticEquivalent?: string;
}

interface SemanticEquivalence {
  readonly requirement: string;
  readonly evidenceInResume: string;
  readonly confidence: number;
}

interface DomainIntelligence {
  readonly domainDistance: DomainDistance;
  readonly vocabularyMatchCount: number;
  readonly transferableSkillCount: number;
  readonly skillGraphOverlapScore?: number;
  readonly embeddingGapMagnitude?: number;
}

interface AtsScore {
  readonly overallScore: number;
  readonly grade: string;
  readonly breakdown?: AtsBreakdown;
  readonly reasoning?: string;
  readonly matchedKeywords: readonly KeywordMatch[];
  readonly missingKeywords: readonly string[];
  readonly suggestions?: readonly string[];
  readonly keywordConfidences?: readonly KeywordConfidence[];
  readonly enrichedSuggestions?: readonly EnrichedSuggestion[];
  readonly enrichedMissingKeywords?: readonly EnrichedMissingKeyword[];
  readonly semanticInsights?: { readonly equivalentExperience?: readonly SemanticEquivalence[] };
  readonly domainIntelligence?: DomainIntelligence;
}

interface AtsPayload {
  readonly before: AtsScore;
  readonly after: AtsScore;
  readonly improvement: number;
}

const GRADE_COLORS: Record<string, string> = {
  A: 'text-emerald-600 dark:text-emerald-400',
  B: 'text-blue-600 dark:text-blue-400',
  C: 'text-yellow-600 dark:text-yellow-400',
  D: 'text-orange-600 dark:text-orange-400',
  F: 'text-red-600 dark:text-red-400',
};

const PRIORITY_STYLES: Record<string, string> = {
  high: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
  medium: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300',
  low: 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400',
  required: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
  preferred: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
};

const DOMAIN_DISTANCE_COLORS: Record<DomainDistance, string> = {
  same: 'text-emerald-600 dark:text-emerald-400',
  adjacent: 'text-blue-600 dark:text-blue-400',
  moderate: 'text-yellow-600 dark:text-yellow-400',
  distant: 'text-red-600 dark:text-red-400',
};

export interface AtsComparisonBodyProps {
  readonly artifact: ArtifactPreview;
  readonly open: boolean;
}

function extractPayload(artifact: ArtifactPreview): AtsPayload | null {
  const asRecord = (raw: unknown): Record<string, unknown> | null => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    return raw as Record<string, unknown>;
  };

  const asScore = (raw: unknown): AtsScore | null => {
    const rec = asRecord(raw);
    if (rec === null) return null;
    const overallRaw =
      typeof rec.overallScore === 'number'
        ? rec.overallScore
        : typeof rec.score === 'number'
        ? rec.score
        : null;
    if (overallRaw === null) return null;
    return {
      overallScore: overallRaw,
      grade: typeof rec.grade === 'string' ? rec.grade : '-',
      matchedKeywords: Array.isArray(rec.matchedKeywords)
        ? (rec.matchedKeywords as readonly KeywordMatch[])
        : [],
      missingKeywords: Array.isArray(rec.missingKeywords)
        ? (rec.missingKeywords as readonly string[])
        : [],
      ...(rec.breakdown && typeof rec.breakdown === 'object'
        ? { breakdown: rec.breakdown as AtsBreakdown }
        : {}),
      ...(typeof rec.reasoning === 'string' ? { reasoning: rec.reasoning } : {}),
      ...(Array.isArray(rec.suggestions)
        ? { suggestions: rec.suggestions as readonly string[] }
        : {}),
      ...(Array.isArray(rec.keywordConfidences)
        ? { keywordConfidences: rec.keywordConfidences as readonly KeywordConfidence[] }
        : {}),
      ...(Array.isArray(rec.enrichedSuggestions)
        ? { enrichedSuggestions: rec.enrichedSuggestions as readonly EnrichedSuggestion[] }
        : {}),
      ...(Array.isArray(rec.enrichedMissingKeywords)
        ? { enrichedMissingKeywords: rec.enrichedMissingKeywords as readonly EnrichedMissingKeyword[] }
        : {}),
      ...(rec.semanticInsights && typeof rec.semanticInsights === 'object'
        ? {
            semanticInsights: rec.semanticInsights as {
              readonly equivalentExperience?: readonly SemanticEquivalence[];
            },
          }
        : {}),
      ...(rec.domainIntelligence && typeof rec.domainIntelligence === 'object'
        ? { domainIntelligence: rec.domainIntelligence as DomainIntelligence }
        : {}),
    };
  };

  const unwrapCandidates = (raw: unknown): readonly unknown[] => {
    const queue: unknown[] = [raw];
    const out: unknown[] = [];
    const seen = new Set<unknown>();
    while (queue.length > 0) {
      const current = queue.shift();
      if (current === undefined || seen.has(current)) continue;
      seen.add(current);
      out.push(current);
      const rec = asRecord(current);
      if (rec === null) continue;
      for (const key of [
        'payload',
        'data',
        'result',
        'output',
        'ats',
        'atsScore',
        'atsScorecard',
        'scorecard',
        'comparison',
        'atsComparison',
      ]) {
        const nested = rec[key];
        if (nested !== undefined) queue.push(nested);
      }
    }
    return out;
  };

  const tryParse = (raw: unknown): AtsPayload | null => {
    for (const candidate of unwrapCandidates(raw)) {
      const obj = asRecord(candidate);
      if (obj === null) continue;
      const before = asScore(obj.before);
      const after = asScore(obj.after);
      if (before === null || after === null) continue;
      const improvement =
        typeof obj.improvement === 'number'
          ? obj.improvement
          : typeof obj.delta === 'number'
          ? obj.delta
          : typeof obj.change === 'number'
          ? obj.change
          : after.overallScore - before.overallScore;
      return { before, after, improvement };
    }
    return null;
  };
  if (artifact.payload) {
    const p = tryParse(artifact.payload);
    if (p) return p;
  }
  if (artifact.content !== null) {
    try {
      return tryParse(JSON.parse(artifact.content));
    } catch {
      // fall through
    }
  }
  return null;
}

function DeltaDisplay({ before, after }: { before: number; after: number }): React.ReactElement {
  const delta = after - before;
  if (delta === 0) return <span className="text-zinc-400">0</span>;
  if (delta > 0) return <span className="text-emerald-600 dark:text-emerald-400">+{delta}</span>;
  return <span className="text-red-600 dark:text-red-400">{delta}</span>;
}

function ComparisonRow({
  label,
  before,
  after,
}: {
  label: string;
  before: number;
  after: number;
}): React.ReactElement {
  return (
    <div className="flex items-center justify-between gap-1 py-0.5 text-[11px]">
      <span className="flex-1 truncate text-zinc-600 dark:text-zinc-400">{label}</span>
      <span className="w-7 text-right font-mono text-zinc-500 dark:text-zinc-400">{before}</span>
      <span className="text-zinc-400">&rarr;</span>
      <span className="w-7 text-right font-mono text-zinc-800 dark:text-zinc-100">{after}</span>
      <span className="w-9 text-right font-mono">
        <DeltaDisplay before={before} after={after} />
      </span>
    </div>
  );
}

function PriorityBadge({ priority }: { priority: string }): React.ReactElement {
  const style = PRIORITY_STYLES[priority] ?? PRIORITY_STYLES.low;
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${style}`}
    >
      {priority}
    </span>
  );
}

function SectionBadge({ section }: { section: string }): React.ReactElement {
  return (
    <span className="inline-flex items-center rounded bg-violet-100 px-1.5 py-0.5 text-[9px] font-medium text-violet-700 dark:bg-violet-900/30 dark:text-violet-300">
      {section}
    </span>
  );
}

function CollapsibleSection({
  title,
  count,
  defaultOpen = false,
  children,
}: {
  title: string;
  count?: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}): React.ReactElement {
  const [open, setOpen] = useState<boolean>(defaultOpen);
  return (
    <div className="mt-2 border-t border-zinc-200 pt-2 dark:border-zinc-700">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-1.5 text-left text-[11px] font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
      >
        <svg
          className={`h-3 w-3 transition-transform ${open ? 'rotate-90' : ''}`}
          fill="currentColor"
          viewBox="0 0 20 20"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M7.21 14.77a.75.75 0 0 1 .02-1.06L11.168 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02Z"
            clipRule="evenodd"
          />
        </svg>
        <span>{title}</span>
        {count !== undefined && count > 0 ? (
          <span className="rounded-full bg-zinc-200 px-1.5 py-0.5 font-mono text-[9px] text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200">
            {count}
          </span>
        ) : null}
      </button>
      {open ? <div className="mt-1.5">{children}</div> : null}
    </div>
  );
}

function ConfidenceDistribution({
  confidences,
}: {
  confidences: readonly KeywordConfidence[];
}): React.ReactElement | null {
  const total = confidences.length;
  if (total === 0) return null;
  const high = confidences.filter((c) => c.confidence >= 0.8).length;
  const medium = confidences.filter((c) => c.confidence >= 0.5 && c.confidence < 0.8).length;
  const low = confidences.filter((c) => c.confidence >= 0.3 && c.confidence < 0.5).length;
  const missing = confidences.filter((c) => c.confidence < 0.3).length;
  const segments = [
    { count: high, color: 'bg-emerald-500', label: 'Strong' },
    { count: medium, color: 'bg-yellow-500', label: 'Moderate' },
    { count: low, color: 'bg-orange-500', label: 'Weak' },
    { count: missing, color: 'bg-red-500', label: 'Missing' },
  ].filter((s) => s.count > 0);
  return (
    <div>
      <div className="flex h-1.5 gap-px overflow-hidden rounded-full">
        {segments.map((s) => (
          <div
            key={s.label}
            className={s.color}
            style={{ width: `${(s.count / total) * 100}%` }}
            title={`${s.label}: ${s.count}/${total}`}
          />
        ))}
      </div>
      <div className="mt-1 flex flex-wrap gap-2">
        {segments.map((s) => (
          <span
            key={s.label}
            className="flex items-center gap-1 text-[9px] text-zinc-500 dark:text-zinc-400"
          >
            <span className={`inline-block h-1.5 w-1.5 rounded-full ${s.color}`} />
            {s.label} ({s.count})
          </span>
        ))}
      </div>
    </div>
  );
}

function EnrichedSuggestionsList({
  items,
}: {
  items: readonly EnrichedSuggestion[];
}): React.ReactElement {
  const sorted = [...items].sort((a, b) => b.estimatedScoreImpact - a.estimatedScoreImpact);
  return (
    <div className="flex flex-col gap-2">
      {sorted.map((s, idx) => (
        <div
          key={`${s.targetSection}-${idx}`}
          className="flex flex-col gap-1 rounded-lg bg-zinc-50 p-2 dark:bg-zinc-800/50"
        >
          <div className="flex flex-wrap items-center gap-1">
            <PriorityBadge priority={s.priority} />
            <SectionBadge section={s.targetSection} />
            <span className="font-mono text-[10px] text-emerald-600 dark:text-emerald-400">
              +{s.estimatedScoreImpact}pts
            </span>
          </div>
          <p className="text-[11px] leading-relaxed text-zinc-700 dark:text-zinc-300">{s.text}</p>
        </div>
      ))}
    </div>
  );
}

function BasicSuggestionsList({
  items,
}: {
  items: readonly string[];
}): React.ReactElement {
  return (
    <div className="flex flex-col gap-1.5">
      {items.map((s, idx) => (
        <div
          key={idx}
          className="flex items-start gap-1.5 rounded-lg bg-zinc-50 p-2 dark:bg-zinc-800/50"
        >
          <span className="mt-0.5 shrink-0 text-emerald-500">&bull;</span>
          <p className="text-[11px] leading-relaxed text-zinc-700 dark:text-zinc-300">{s}</p>
        </div>
      ))}
    </div>
  );
}

function EnrichedMissingList({
  items,
}: {
  items: readonly EnrichedMissingKeyword[];
}): React.ReactElement {
  const required = items.filter((k) => k.priority === 'required');
  const preferred = items.filter((k) => k.priority === 'preferred');
  const ordered = [...required, ...preferred];
  return (
    <div className="flex flex-col gap-2">
      {ordered.map((kw, idx) => (
        <div key={idx} className="rounded-lg bg-zinc-50 p-2 dark:bg-zinc-800/50">
          <div className="mb-0.5 flex flex-wrap items-center gap-1">
            <PriorityBadge priority={kw.priority} />
            <span className="text-[11px] font-semibold text-zinc-800 dark:text-zinc-100">
              {kw.keyword}
            </span>
            <SectionBadge section={kw.suggestedSection} />
          </div>
          <p className="text-[11px] leading-relaxed text-zinc-600 dark:text-zinc-400">
            {kw.additionGuidance}
          </p>
          {kw.semanticEquivalent ? (
            <p className="mt-0.5 text-[10px] text-emerald-600 dark:text-emerald-400">
              Similar to &ldquo;{kw.semanticEquivalent}&rdquo; already in your CV
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function DomainIntelligenceBlock({
  intel,
}: {
  intel: DomainIntelligence;
}): React.ReactElement {
  const color = DOMAIN_DISTANCE_COLORS[intel.domainDistance] ?? 'text-zinc-500';
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
      <div>
        <span className="text-zinc-500 dark:text-zinc-400">Domain distance:</span>
        <span className={`ml-1 font-semibold capitalize ${color}`}>{intel.domainDistance}</span>
      </div>
      <div>
        <span className="text-zinc-500 dark:text-zinc-400">Vocab matches:</span>
        <span className="ml-1 font-semibold text-zinc-800 dark:text-zinc-100">
          {intel.vocabularyMatchCount}
        </span>
      </div>
      <div>
        <span className="text-zinc-500 dark:text-zinc-400">Transferable skills:</span>
        <span className="ml-1 font-semibold text-zinc-800 dark:text-zinc-100">
          {intel.transferableSkillCount}
        </span>
      </div>
      {intel.skillGraphOverlapScore !== undefined ? (
        <div>
          <span className="text-zinc-500 dark:text-zinc-400">Skill-graph overlap:</span>
          <span className="ml-1 font-semibold text-zinc-800 dark:text-zinc-100">
            {Math.round(intel.skillGraphOverlapScore * 100)}%
          </span>
        </div>
      ) : null}
      {intel.embeddingGapMagnitude !== undefined ? (
        <div>
          <span className="text-zinc-500 dark:text-zinc-400">Embedding gap:</span>
          <span className="ml-1 font-semibold text-zinc-800 dark:text-zinc-100">
            {Math.round(intel.embeddingGapMagnitude * 100)}%
          </span>
        </div>
      ) : null}
    </div>
  );
}

function SemanticEquivalencesList({
  items,
}: {
  items: readonly SemanticEquivalence[];
}): React.ReactElement | null {
  const high = items.filter((e) => e.confidence >= 0.7);
  if (high.length === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      {high.map((eq, idx) => (
        <div key={idx} className="flex flex-wrap items-start gap-1 text-[11px]">
          <span className="shrink-0 text-zinc-500 dark:text-zinc-400">JD:</span>
          <span className="text-zinc-700 dark:text-zinc-300">{eq.requirement}</span>
          <span className="shrink-0 text-zinc-400">&rarr;</span>
          <span className="text-emerald-700 dark:text-emerald-300">{eq.evidenceInResume}</span>
          <span className="shrink-0 font-mono text-[9px] text-zinc-400">
            {Math.round(eq.confidence * 100)}%
          </span>
        </div>
      ))}
    </div>
  );
}

function MatchedKeywordsList({
  matches,
}: {
  matches: readonly KeywordMatch[];
}): React.ReactElement | null {
  const withContext = matches.filter(
    (m) => m.synonymUsed || m.context || (m.confidence !== undefined && m.confidence < 1),
  );
  if (withContext.length === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      {withContext.map((m, idx) => {
        const conf = m.confidence ?? 1;
        const lowConf = conf < 0.8;
        const pillColor = lowConf
          ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300'
          : 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300';
        return (
          <div key={idx} className="flex flex-wrap items-start gap-1 text-[11px]">
            <span className={`shrink-0 rounded-full px-2 py-0.5 ${pillColor}`}>{m.keyword}</span>
            {m.confidence !== undefined && m.confidence < 1 ? (
              <span className="shrink-0 font-mono text-[9px] text-zinc-400">
                {Math.round(m.confidence * 100)}%
              </span>
            ) : null}
            {m.matchChannel ? (
              <span className="shrink-0 text-[9px] text-violet-500 dark:text-violet-400">
                [{m.matchChannel}]
              </span>
            ) : null}
            {m.synonymUsed ? (
              <span className="italic text-zinc-500 dark:text-zinc-400">
                via &ldquo;{m.synonymUsed}&rdquo;
              </span>
            ) : null}
            {m.context && !m.synonymUsed ? (
              <span className="truncate italic text-zinc-500 dark:text-zinc-400">{m.context}</span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export function AtsComparisonBody({ artifact }: AtsComparisonBodyProps): React.ReactElement {
  const payload = useMemo(() => extractPayload(artifact), [artifact]);

  if (payload === null) {
    return (
      <p
        data-testid="artifact-body-ats-unparseable"
        className="text-xs italic text-zinc-500 dark:text-zinc-400"
      >
        ATS comparison payload missing. Download the artifact to inspect.
      </p>
    );
  }

  const { before, after, improvement } = payload;
  const rawPercent = before.overallScore > 0 ? (improvement / before.overallScore) * 100 : 0;
  const improvementPercent = Number.isFinite(rawPercent) ? Math.round(rawPercent) : 0;
  const beforeGrade = GRADE_COLORS[before.grade] ?? 'text-zinc-600 dark:text-zinc-400';
  const afterGrade = GRADE_COLORS[after.grade] ?? 'text-zinc-600 dark:text-zinc-400';

  const addedKeywords = before.missingKeywords.filter((kw) =>
    after.matchedKeywords.some(
      (m) => m.keyword.toLocaleLowerCase('en') === kw.toLocaleLowerCase('en'),
    ),
  );
  const stillMissing = after.missingKeywords;
  const enrichedSuggestions = after.enrichedSuggestions ?? [];
  const basicSuggestions = enrichedSuggestions.length === 0 ? (after.suggestions ?? []) : [];
  const enrichedMissing = after.enrichedMissingKeywords ?? [];
  const semanticEquivs = after.semanticInsights?.equivalentExperience ?? [];

  return (
    <div data-testid="artifact-body-ats" className="flex flex-col gap-2 text-xs">
      <div className="grid grid-cols-3 gap-2">
        <div className="text-center">
          <div className="text-[9px] uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
            Before
          </div>
          <div className="text-xl font-bold text-zinc-500 dark:text-zinc-400">
            {before.overallScore}
          </div>
          <div className={`text-xs font-semibold ${beforeGrade}`}>{before.grade}</div>
        </div>
        <div className="text-center">
          <div className="text-[9px] uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
            After
          </div>
          <div className="text-xl font-bold text-zinc-900 dark:text-zinc-50">
            {after.overallScore}
          </div>
          <div className={`text-xs font-semibold ${afterGrade}`}>{after.grade}</div>
        </div>
        <div className="text-center">
          <div className="text-[9px] uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
            Change
          </div>
          <div
            className={`text-xl font-bold ${
              improvement > 0
                ? 'text-emerald-600 dark:text-emerald-400'
                : improvement < 0
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-zinc-400'
            }`}
          >
            {improvement > 0 ? '+' : ''}
            {improvement}
          </div>
          {improvementPercent !== 0 ? (
            <div className="text-[10px] text-zinc-500 dark:text-zinc-400">
              {improvementPercent > 0 ? '+' : ''}
              {improvementPercent}%
            </div>
          ) : null}
        </div>
      </div>

      {before.breakdown && after.breakdown ? (
        <div className="border-t border-zinc-200 pt-1.5 dark:border-zinc-700">
          <ComparisonRow
            label="Keyword match"
            before={before.breakdown.keywordMatch}
            after={after.breakdown.keywordMatch}
          />
          <ComparisonRow
            label="Experience"
            before={before.breakdown.experienceRelevance}
            after={after.breakdown.experienceRelevance}
          />
          <ComparisonRow
            label="Skills coverage"
            before={before.breakdown.skillsCoverage}
            after={after.breakdown.skillsCoverage}
          />
          <ComparisonRow
            label="Education"
            before={before.breakdown.educationFit}
            after={after.breakdown.educationFit}
          />
          <ComparisonRow
            label="Format"
            before={before.breakdown.formatQuality}
            after={after.breakdown.formatQuality}
          />
        </div>
      ) : null}

      {after.reasoning ? (
        <div className="border-t border-zinc-200 pt-2 dark:border-zinc-700">
          <div className="mb-1 text-[10px] font-medium text-zinc-500 dark:text-zinc-400">
            AI analysis
          </div>
          <p className="text-[11px] italic leading-relaxed text-zinc-700 dark:text-zinc-300">
            {after.reasoning}
          </p>
        </div>
      ) : null}

      {addedKeywords.length > 0 || (stillMissing.length > 0 && enrichedMissing.length === 0) ? (
        <div className="flex flex-col gap-2 border-t border-zinc-200 pt-2 dark:border-zinc-700">
          {addedKeywords.length > 0 ? (
            <div>
              <div className="mb-1 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                Added
              </div>
              <div className="flex flex-wrap gap-1">
                {addedKeywords.map((kw) => (
                  <span
                    key={kw}
                    className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                  >
                    {kw}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
          {stillMissing.length > 0 && enrichedMissing.length === 0 ? (
            <div>
              <div className="mb-1 text-[10px] font-medium text-red-600 dark:text-red-400">
                Still missing
              </div>
              <div className="flex flex-wrap gap-1">
                {stillMissing.map((kw) => (
                  <span
                    key={kw}
                    className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] text-red-700 dark:bg-red-900/30 dark:text-red-300"
                  >
                    {kw}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {after.keywordConfidences && after.keywordConfidences.length > 0 ? (
        <div className="border-t border-zinc-200 pt-2 dark:border-zinc-700">
          <div className="mb-1 text-[10px] font-medium text-zinc-500 dark:text-zinc-400">
            Match confidence
          </div>
          <ConfidenceDistribution confidences={after.keywordConfidences} />
        </div>
      ) : null}

      {enrichedMissing.length > 0 ? (
        <CollapsibleSection
          title="Missing keywords"
          count={enrichedMissing.length}
          defaultOpen={enrichedMissing.length <= 6}
        >
          <EnrichedMissingList items={enrichedMissing} />
        </CollapsibleSection>
      ) : null}

      {after.domainIntelligence ? (
        <CollapsibleSection title="Domain intelligence" defaultOpen>
          <DomainIntelligenceBlock intel={after.domainIntelligence} />
        </CollapsibleSection>
      ) : null}

      {enrichedSuggestions.length > 0 ? (
        <CollapsibleSection
          title="Improvement suggestions"
          count={enrichedSuggestions.length}
          defaultOpen
        >
          <EnrichedSuggestionsList items={enrichedSuggestions} />
        </CollapsibleSection>
      ) : null}

      {basicSuggestions.length > 0 ? (
        <CollapsibleSection
          title="Suggestions"
          count={basicSuggestions.length}
          defaultOpen
        >
          <BasicSuggestionsList items={basicSuggestions} />
        </CollapsibleSection>
      ) : null}

      {semanticEquivs.length > 0 ? (
        <CollapsibleSection title="Recognized equivalents">
          <SemanticEquivalencesList items={semanticEquivs} />
        </CollapsibleSection>
      ) : null}

      {after.matchedKeywords.some(
        (m) => m.synonymUsed || m.context || (m.confidence !== undefined && m.confidence < 1),
      ) ? (
        <CollapsibleSection title="Keyword match details">
          <MatchedKeywordsList matches={after.matchedKeywords} />
        </CollapsibleSection>
      ) : null}
    </div>
  );
}
