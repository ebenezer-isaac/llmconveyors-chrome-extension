# Extension Boundaries

Chrome MV3 forces physical isolation between content scripts, the background service worker, popup, side panel, and options page. Violating this isolation produces subtle runtime failures that pass TypeScript but break at install time. These rules encode the boundaries and the validator enforces them.

## Rule 1 -- Content-script boundary

Files under `entrypoints/content/**` and `src/content/**`:

- NO `fetch(` -- all network goes through the background via `sendMessage`. Enforcement: grep gate.
- NO `chrome.storage.*` direct calls -- message the background, which owns storage. Rationale: storage change events propagate via `AUTH_STATE_CHANGED` broadcasts already.
- NO imports from `src/background/**` at runtime (the bundles are physically separate service-worker vs content-script; importing across does not link -- the compiler may let it through but the runtime does not).
- YES imports from `src/core/**` (pure shared code) and `src/_blueprints/**` (types only).
- YES `sendMessage` via the typed facade from `src/background/messaging/protocol.ts` (types-only import path).

## Rule 2 -- Background service-worker boundary

Files under `entrypoints/background.ts` and `src/background/**`:

- NO DOM APIs (`document`, `window`, `HTMLElement`, `MutationObserver`). Service workers have no DOM.
- NO imports from `entrypoints/content/**` or `src/content/**`. Content scripts run in page context; background cannot reach their module instances.
- NO module-level singletons that hold state across service-worker suspension. MV3 workers are killed after ~30s idle; module state evaporates. Persist to `chrome.storage.*` (Zod-validated) instead.
- YES `fetch`, `chrome.*` APIs (including `chrome.tabs.sendMessage` to reach content scripts), `chrome.storage.local`.

## Rule 3 -- Popup / side panel / options boundary

Files under `entrypoints/popup/**`, `entrypoints/sidepanel/**`, `entrypoints/options/**` and the React code under `src/popup/**`, `src/sidepanel/**`, `src/options/**`:

- React components only. No direct I/O.
- All data fetched via `sendMessage` to background, or `chrome.storage.local.get` passed through a Zod guard.
- NO `fetch(` directly. NO `chrome.scripting.*` (that is background's job).
- State lives in component state + React Query if needed; do not invent a cross-view bus.

## Rule 4 -- Engine dependency boundary

The `ats-autofill-engine` package is consumed through EXPLICIT sub-entries only:

```ts
import type { AtsAdapter, FormModel } from 'ats-autofill-engine';
import { adapter as greenhouseAdapter } from 'ats-autofill-engine/greenhouse';
import { adapter as leverAdapter }      from 'ats-autofill-engine/lever';
import { adapter as workdayAdapter }    from 'ats-autofill-engine/workday';
import { applyHighlights, scanForm }    from 'ats-autofill-engine/dom';
import { ProfileSchema }                from 'ats-autofill-engine/profile';
```

- NEVER deep-import `from 'ats-autofill-engine/dist/...'`. Those paths are internal implementation.
- NEVER import more than one vendor adapter into a single compilation unit. The autofill controller dynamically picks the right adapter at runtime based on `adapter.matchesUrl(location.href)`.

## Rule 5 -- MV3 service-worker lifecycle

Every long operation in the background MUST tolerate suspension:

- Break work into independently-restartable units. Persist progress to `chrome.storage.local` at each unit boundary.
- Do NOT assume in-memory promises survive between events. The service worker can be killed mid-promise; on wake, re-hydrate from storage.
- Keepalive hacks (setInterval pings) are forbidden -- they burn battery and Chrome will kill them anyway.
- Alarms (`chrome.alarms`) are the canonical way to re-enter a long operation after a break.

## Enforcement

- `validate:grep-gates` scans for `fetch(` in content / popup / sidepanel / options.
- `validate:blueprints` reads every blueprint's `forbiddenImports` glob and scans the import graph.
- `validate:protocol-schema` ensures messaging stays the single API surface across boundaries.

A violation of any of these rules that passes review and lands is a P0 fix.
