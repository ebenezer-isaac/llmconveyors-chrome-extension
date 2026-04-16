// SPDX-License-Identifier: MIT
/**
 * Agent registry -- local mirror of the web app's AGENT_REGISTRY.
 *
 * authoritative source: e:/llmconveyors.com/src/config/agents.ts
 *
 * The extension ships a parallel frozen registry so the popup / side panel /
 * options page can look up agent routing and branding without a network
 * round-trip. When new agents land in the web app, bump this file too and
 * keep the `AGENT_IDS` tuple in sync.
 */

export type AgentId = 'job-hunter' | 'b2b-sales';

export interface AgentRegistryEntry {
  readonly id: AgentId;
  readonly routePath: string;
  readonly subdomain: string;
  readonly apiEndpoint: string;
  readonly hasSettings: boolean;
  readonly isPublic: boolean;
  readonly accentColor: string;
  readonly iconSvg: string;
  readonly label: string;
  readonly shortDescription: string;
  readonly settingsPath: string;
  readonly dashboardPath: string;
  readonly resumePath: string | null;
}

function deepFreeze<T extends Record<string, unknown>>(obj: T): T {
  Object.freeze(obj);
  for (const value of Object.values(obj)) {
    if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
      deepFreeze(value as Record<string, unknown>);
    }
  }
  return obj;
}

export const AGENT_REGISTRY: Record<AgentId, AgentRegistryEntry> = deepFreeze({
  'job-hunter': {
    id: 'job-hunter',
    routePath: '/job-hunt',
    subdomain: 'job-hunt',
    apiEndpoint: '/api/agents/job-hunter/generate',
    hasSettings: true,
    isPublic: true,
    accentColor: 'emerald',
    iconSvg:
      'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8',
    label: 'Job Hunter',
    shortDescription: 'Tailor CVs and cold emails to every role.',
    // Settings + resume live inside the agent dashboard drawer (see
    // renderSettings in the web app's src/lib/agents/job-hunt/index.tsx).
    // There are no standalone /settings or /settings/resume routes, so
    // these paths are empty: every action routes to the dashboard root
    // and the user opens the drawer from there. Inventing a query-param
    // deep-link convention here would be a lie until the web app
    // actually consumes one.
    settingsPath: '',
    dashboardPath: '',
    resumePath: '',
  },
  'b2b-sales': {
    id: 'b2b-sales',
    routePath: '/b2b-sales',
    subdomain: 'b2b-sales',
    apiEndpoint: '/api/agents/b2b-sales/generate',
    hasSettings: true,
    isPublic: true,
    accentColor: 'purple',
    iconSvg:
      'M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z M22 6l-10 7L2 6',
    label: 'B2B Sales',
    shortDescription: 'Research companies and draft outbound email.',
    settingsPath: '',
    dashboardPath: '',
    resumePath: null,
  },
} as Record<AgentId, AgentRegistryEntry>);

/** Ordered list of all agent IDs */
export const AGENT_IDS: readonly AgentId[] = Object.freeze(
  Object.keys(AGENT_REGISTRY) as AgentId[],
);

export const DEFAULT_AGENT_ID: AgentId = AGENT_IDS[0] as AgentId;

/** Prototype-pollution-safe lookup by ID. */
export function getAgentById(id: string): AgentRegistryEntry | undefined {
  if (!Object.hasOwn(AGENT_REGISTRY, id)) return undefined;
  return AGENT_REGISTRY[id as AgentId];
}

export function isAgentId(id: string): id is AgentId {
  return Object.hasOwn(AGENT_REGISTRY, id);
}

// ---------------------------------------------------------------------------
// URL builder
// ---------------------------------------------------------------------------

export type AgentUrlKind = 'dashboard' | 'settings' | 'resume';

export interface BuildAgentUrlOptions {
  readonly rootDomain: string;
  readonly locale: string;
  readonly scheme?: 'https' | 'http';
}

/**
 * Build a fully-qualified URL for a given agent page kind.
 *
 * Returns `null` when the agent does not support the requested kind
 * (e.g. `resume` for b2b-sales).
 */
export function buildAgentUrl(
  agent: AgentRegistryEntry,
  kind: AgentUrlKind,
  opts: BuildAgentUrlOptions,
): string | null {
  const scheme = opts.scheme ?? 'https';
  const base = `${scheme}://${agent.subdomain}.${opts.rootDomain}/${opts.locale}`;

  switch (kind) {
    case 'dashboard':
      return agent.dashboardPath === '' ? base : `${base}${agent.dashboardPath}`;
    case 'settings':
      return `${base}${agent.settingsPath}`;
    case 'resume':
      return agent.resumePath === null ? null : `${base}${agent.resumePath}`;
  }
}
