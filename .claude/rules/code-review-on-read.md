# Passive Code Review -- On Every File Read (extension)

Silently scan and FLAG these issues inline when any extension source file is read. Every bug flagged MUST get a fix task in the phase plan. Skip test files unless the defect affects test correctness.

## Flag categories

**Dead / Legacy**: unused imports / vars / functions, commented-out code, backward-compat shims, `// TODO` / `// HACK` / `// FIXME` without linked issue `(#NNN)`.

**Architecture (Hexagonal)**: `src/core/**` importing DOM (`document`, `window`, `HTMLElement`) or `chrome.*`; cross-adapter imports (`src/ats/<a>/**` importing `src/ats/<b>/**`); business logic inside entrypoints (entrypoints should be thin wrappers over background / content modules); adapters without a `blueprint.ts`.

**Code Quality**: any `console.*` outside `src/background/log.ts` (the structured logger implementation); `any` types (use `unknown` + narrowing); mutable module-level state (MV3 service-worker is suspended between events; state evaporates); deep nesting > 3; functions > 50 lines; files > 400 lines; hardcoded ATS selectors outside `src/ats/<vendor>/selectors.ts`; swallowed errors; fire-and-forget losing critical side effects (billing, storage writes).

**Extension-specific**: `fetch(` in any `entrypoints/content/**` or `entrypoints/popup/**` or `entrypoints/sidepanel/**` or `entrypoints/options/**` (must route through background via `sendMessage`); `chrome.storage.local.set(` without a Zod parse of the value first; `chrome.storage.local.get(` without a Zod parse of the result; `chrome.tabs.sendMessage(` with untyped payload (must use typed messaging facade).

**Inefficiency**: N+1 scanning (re-running `scanForm` in a loop when a single pass returns everything); sequential awaits that could be `Promise.all`; redundant DOM queries (cache querySelectorAll results); MV3 service-worker long tasks that do not tolerate suspension.

**Blueprint Drift**: code contradicts blueprint; `ProtocolMap` keys not present in `src/background/messaging/blueprint.ts`; adapter exports absent from `src/ats/<vendor>/blueprint.ts` `publicExports`; stale `sourceRef`; `knownIssues` `status: fixed` without linked commit hash; undocumented messaging handler.

**Structure**: wrong directory (autofill logic outside `src/content/autofill/**`); missing barrel export; tests not co-located with module; blueprint missing on a non-trivial module.

## Format

```
WARN [filename:line] <CATEGORY>: <description>
```

Use only `WARN ` prefix; do NOT use any non-ASCII characters (em-dashes, triangles, fancy quotes) in the flag output. Flags are read by orchestrator scripts that grep for the prefix.

## When NOT to flag

- Test files (`**/*.spec.ts`, `**/*.test.ts`, `tests/harness/**`) for most categories, unless the defect affects correctness of the test itself.
- `src/_blueprints/**` template files -- sentinel comments like `// A5 FILLS THIS` are expected.
- Generated files (`docs/protocol.schema.json`, `docs/protocol.md`) -- these are generator output; fix the generator, not the output.
