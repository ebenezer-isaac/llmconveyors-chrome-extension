/**
 * ModuleBlueprint type definitions for the extension repo.
 *
 * Every module under `src/background/**`, `src/content/**`, and `src/ats/<vendor>/**`
 * owns a `blueprint.ts` typed against `ModuleBlueprint`. The validator
 * (`scripts/validate-blueprints.ts`, implemented in A1) parses every blueprint
 * and cross-checks against the actual source.
 *
 * These types are ported from `@repo/shared-types` in the main repo and adapted:
 * HTTP `endpoints` becomes `messageHandlers` (since the extension surfaces are
 * chrome.runtime messages, not HTTP). Invariants, knownIssues, sourceRefs have
 * identical shape. New fields: `forbiddenImports`, `publicExports`.
 *
 * Zero `any`. Use `unknown` + narrow at the call site if a genuinely
 * polymorphic value is needed.
 */

export type HandlerLocation = 'background' | 'content' | 'popup';

export type InvariantSeverity = 'error' | 'warning';

export type IssueStatus = 'open' | 'fixed' | 'wontfix';

export type ModuleCategory =
  | 'messaging'
  | 'auth'
  | 'profile'
  | 'autofill'
  | 'highlight'
  | 'intent'
  | 'ui'
  | 'ats-adapter'
  | 'core-util';

/**
 * A `SourceRef` pins a claim in the blueprint to a concrete file and line.
 * The validator rejects blueprints whose refs point at non-existent files
 * or lines past EOF.
 */
export interface SourceRef {
  readonly file: string;
  readonly line: number;
}

/**
 * An invariant is a single testable property of the module. The `check` field
 * is interpreted by the validator; shapes match the main-repo blueprint.
 */
export interface InvariantEntry {
  readonly id: string;
  readonly description: string;
  readonly severity: InvariantSeverity;
  readonly check: InvariantCheck;
  readonly sourceRef: SourceRef;
}

export type InvariantCheck =
  | { readonly type: 'exists'; readonly path: string }
  | { readonly type: 'type'; readonly path: string; readonly expected: 'string' | 'number' | 'boolean' | 'object' | 'array' }
  | { readonly type: 'equals'; readonly path: string; readonly value: string | number | boolean }
  | { readonly type: 'regex'; readonly path: string; readonly pattern: string }
  | { readonly type: 'custom'; readonly description: string };

/**
 * A known issue is a filed bug the team has not yet fixed, or has fixed
 * (with commit hash) for audit history. The validator enforces that
 * `status === 'fixed'` requires `fixedInCommit`.
 */
export interface KnownIssue {
  readonly id: string;
  readonly severity: InvariantSeverity;
  readonly status: IssueStatus;
  readonly description: string;
  readonly impact: string;
  readonly fix: string;
  readonly sourceRef: SourceRef;
  readonly discoveredIn: string;
  readonly fixedInCommit?: string;
}

/**
 * A message-handler entry corresponds to one ProtocolMap key. The validator
 * Layer 3 cross-checks: every ProtocolMap key has exactly one entry; every
 * entry's `handlerLocation` has a matching `onMessage` registration; every
 * `requestSchemaRef` / `responseSchemaRef` resolves to a real exported Zod
 * schema.
 */
export interface MessageHandlerEntry {
  readonly key: string;
  readonly description: string;
  readonly handlerLocation: HandlerLocation;
  readonly requestSchemaRef: string;
  readonly responseSchemaRef: string;
  readonly broadcastOnly: boolean;
  readonly invariants: ReadonlyArray<InvariantEntry>;
  readonly sourceRef: SourceRef;
}

/**
 * The canonical blueprint shape. Every `src/<area>/<module>/blueprint.ts`
 * exports `const blueprint: ModuleBlueprint = { ... }`. The file's only
 * purpose is to be imported by the validator.
 */
export interface ModuleBlueprint {
  readonly moduleId: string;
  readonly label: string;
  readonly description: string;
  readonly category: ModuleCategory;
  readonly publicExports: ReadonlyArray<string>;
  readonly forbiddenImports: ReadonlyArray<string>;
  readonly messageHandlers: ReadonlyArray<MessageHandlerEntry>;
  readonly invariants: ReadonlyArray<InvariantEntry>;
  readonly knownIssues: ReadonlyArray<KnownIssue>;
}
