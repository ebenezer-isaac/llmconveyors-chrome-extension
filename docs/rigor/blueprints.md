# Blueprints as Single Source of Truth

## Why

The extension has three physically isolated runtime surfaces (content script, service worker, UI views) plus the engine dependency plus the backend API. Without a single authoritative spec per module, drift is inevitable: a ProtocolMap key gets added without a handler, a handler exists without a ProtocolMap entry, a blueprint references a sourceRef that was refactored away. Each of these is a latent bug.

Blueprints address drift by making the spec a code artifact the TypeScript compiler and a dedicated validator both enforce. Benefits:

- **Drift prevention**: the validator's 7 checks guarantee spec-code parity on every commit.
- **Agentic-friendly**: an LLM executor asked to add a new handler has a canonical place to read the contract (`blueprint.ts`) and a canonical place to extend it (same file). No hunting through prose docs.
- **Review-friendly**: a PR diff on `blueprint.ts` communicates intent before the reviewer reads a single handler line.
- **Audit trail**: `blueprint.issues.md` per module captures bugs found, their fix commits, and their impact.

## How to read a blueprint

Example: `src/background/messaging/blueprint.ts` (filled by A5).

```ts
import type { ModuleBlueprint } from '../../_blueprints/blueprint.types';

export const blueprint: ModuleBlueprint = {
  moduleId: 'background/messaging',
  label: 'Background Messaging Surface',
  description: '...',
  category: 'messaging',
  publicExports: ['ProtocolMap', 'sendMessage', 'onMessage', 'HANDLERS'],
  forbiddenImports: ['src/content/**', 'ats-autofill-engine/dist/**'],
  messageHandlers: [
    {
      key: 'AUTH_SIGN_IN',
      description: 'Open OAuth window, exchange code, store tokens',
      handlerLocation: 'background',
      requestSchemaRef: './schemas/auth-sign-in-request',
      responseSchemaRef: './schemas/auth-state-response',
      broadcastOnly: false,
      invariants: [
        { id: 'auth-sign-in-writes-tokens', description: 'On success, chrome.storage.local has tokens', severity: 'error', check: { type: 'custom', description: 'manual' }, sourceRef: { file: 'src/background/auth/tokens.ts', line: 42 } },
      ],
      sourceRef: { file: 'src/background/messaging/handlers.ts', line: 17 },
    },
    // ... 18 more
  ],
  invariants: [...],
  knownIssues: [...],
};
```

How to interpret each field:

- `publicExports` -- symbols every consumer is allowed to import from this module. Validator check 2 enforces the barrel matches.
- `forbiddenImports` -- globs this module MUST NOT import. Validator check 3 enforces zero hits.
- `messageHandlers[].handlerLocation` -- where the `onMessage` registration lives. Validator check 7 enforces a registration exists there.
- `sourceRef` -- a `file:line` pin. Validator check 4 enforces the line exists. Refactor -> update `sourceRef`.
- `knownIssues[].status === 'fixed'` requires `fixedInCommit`. Validator check 6 rejects unlinked fixes.

## How to update a blueprint

Blueprint changes FIRST, code changes SECOND. The PR checklist:

1. Identify the requirement change (new feature, new invariant, bug fix).
2. Edit the blueprint to reflect the new reality.
3. Run `pnpm validate:blueprints` -- expect failures (the blueprint now mismatches the old code).
4. Update the code to match.
5. Re-run `pnpm validate:blueprints` -- must pass.
6. Commit both in the same PR. Reviewer sees the blueprint diff first.

When the change is a bug fix:

1. File the bug in `blueprint.issues.md` with `status: open`, severity, sourceRef, impact, proposed fix.
2. Fix the code.
3. Flip `status: fixed` and add `fixedInCommit`.
4. Update `blueprint.ts` if the fix changed a public surface.

## Validator behavior

Layer 1 (grep) is fast (~8s on 500 files) and covers forbidden tokens. Layer 2 (AST) parses every `blueprint.ts` and cross-checks against the module barrel and source files. Layer 3 (protocol) is messaging-specific and enforces ProtocolMap <-> blueprint parity.

Exit codes: 0 clean, 1 violation (prints structured message), 2 script error (stack to stderr).

## What the validator does NOT check

- Semantic correctness of the invariant text. `description: 'handler validates input'` is not validated; you must actually validate input in the handler.
- Coverage of tests for invariants. Use `vitest coverage.thresholds` (D24) to enforce test coverage.
- Blueprint staleness relative to real runtime behavior at the semantic level. A11 Playwright E2E validates end-to-end; the validator only validates structural parity.
