// SPDX-License-Identifier: MIT
/**
 * Per-agent accent class bundles. Resolves AGENT_REGISTRY[id].accentColor
 * ('emerald' for job-hunter, 'purple' for b2b-sales) into concrete
 * Tailwind class lists the sidepanel surfaces use for headers,
 * borders, and phase dots.
 *
 * Tailwind's JIT scans source files for literal class strings. Keep
 * every class used here spelled out verbatim -- dynamic class name
 * construction would skip JIT and ship the wrong CSS in production.
 */

import type { AgentId } from '@/src/background/agents';

export interface AccentClasses {
  /** Header strip background + border (sidepanel top bar). */
  readonly header: string;
  /** Primary panel border (BoundSessionPanel, ArtifactsPanel). */
  readonly border: string;
  /** Filled button / CTA background + hover. */
  readonly button: string;
  /** Chevron / active toggle colour when a card is open. */
  readonly chevronActive: string;
  /** Dot colour used by the log panel for the primary info level. */
  readonly phaseDot: string;
}

const EMERALD: AccentClasses = Object.freeze({
  header: 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-900',
  border: 'border-emerald-200 dark:border-emerald-900',
  button: 'bg-emerald-500 hover:bg-emerald-600 text-white',
  chevronActive: 'text-emerald-600 dark:text-emerald-300',
  phaseDot: 'bg-emerald-500',
});

const PURPLE: AccentClasses = Object.freeze({
  header: 'bg-purple-50 border-purple-200 dark:bg-purple-950/20 dark:border-purple-900',
  border: 'border-purple-200 dark:border-purple-900',
  button: 'bg-purple-500 hover:bg-purple-600 text-white',
  chevronActive: 'text-purple-600 dark:text-purple-300',
  phaseDot: 'bg-purple-500',
});

const NEUTRAL: AccentClasses = Object.freeze({
  header: 'bg-zinc-50 border-zinc-200 dark:bg-zinc-800 dark:border-zinc-700',
  border: 'border-zinc-200 dark:border-zinc-700',
  button: 'bg-zinc-700 hover:bg-zinc-800 text-white',
  chevronActive: 'text-zinc-700 dark:text-zinc-200',
  phaseDot: 'bg-zinc-500',
});

export const ACCENT_CLASSES: Readonly<Record<AgentId, AccentClasses>> = Object.freeze({
  'job-hunter': EMERALD,
  'b2b-sales': PURPLE,
});

export function accentFor(agentId: AgentId | null): AccentClasses {
  if (agentId === null) return NEUTRAL;
  return ACCENT_CLASSES[agentId] ?? NEUTRAL;
}
