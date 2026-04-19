# Auth Recovery Hardening Plan (GOAT State)

## Objective
Eliminate infinite auth-loop risk by introducing a single global recovery authority with a breaker + backoff policy, then migrate all recovery initiators to that authority.

## Coverage Checklist
- [x] 1. Global recovery coordinator exists with global single-flight + breaker/backoff/half-open probe.
- [x] 2. Recovery ownership is centralized (startup, watcher, fetch, SSE, handlers all route through coordinator).
- [x] 3. Popup auth hook docs/behavior are aligned (remove stale silent-web-auth wording).
- [x] 4. Cookie exchange supports partition/store awareness where available.
- [x] 5. Background silent non-interactive web-auth path is removed from recovery flow.
- [x] 6. Host permissions are narrowed to least privilege needed for product behavior.
- [x] 7. Rollout guard exists (feature flag / kill-switch for coordinator strategy).
- [x] 8. Cross-component invariant tests enforce one recovery attempt under concurrent failures.

## Granular Task List

### Phase 1 - Coordinator Foundation
- [x] 1.1 Create `src/background/auth/recovery-coordinator.ts`.
- [x] 1.2 Add coordinator API types (`recover`, `stateSnapshot`).
- [x] 1.3 Implement global single-flight dedup for all recovery triggers.
- [x] 1.4 Implement breaker state machine: `closed -> open -> half-open -> closed`.
- [x] 1.5 Implement exponential backoff with jitter and max cap.
- [x] 1.6 Add terminal-failure hook to clear/broadcast signed-out state.
- [x] 1.7 Export coordinator from `src/background/auth/index.ts`.

### Phase 2 - Runtime Wiring
- [x] 2.1 Instantiate one coordinator in `src/background/messaging/register-handlers.ts`.
- [x] 2.2 Route `fetch-authed` 401/403 recovery through coordinator.
- [x] 2.3 Route SSE `onAuthLost` recovery through coordinator.
- [x] 2.4 Remove background `interactive:false` web-auth path from recovery wiring.

### Phase 3 - Centralize Initiators
- [x] 3.1 Startup cookie exchange in `entrypoints/background.ts` calls coordinator.
- [x] 3.2 Cookie watcher exchange callback calls coordinator.
- [x] 3.3 Handler-triggered exchange call sites in `src/background/messaging/handlers.ts` call coordinator.

### Phase 4 - Hardening Follow-ups
- [x] 4.1 Add cookie partition/store-aware reads in `src/background/auth/cookie-exchange.ts`.
- [x] 4.2 Add rollout guard in `src/shared/env.ts` (e.g. `authRecoveryMode`).
- [x] 4.3 Tighten host permissions in `wxt.config.ts` to minimum viable scope.
- [x] 4.4 Align popup hook docs in `entrypoints/popup/useAuthState.ts`.

### Phase 5 - Test Net
- [x] 5.1 Add `tests/unit/background/auth/recovery-coordinator.spec.ts`.
- [x] 5.2 Add cross-component concurrency invariant test (fetch + SSE contention).
- [x] 5.3 Update existing auth/generation specs to coordinator wiring behavior.
- [x] 5.4 Run targeted tests first (new + touched auth specs).
- [x] 5.5 Run full extension checks (`pnpm test`, `pnpm lint`, `pnpm typecheck`).

## Execution Notes
- Implement in order; do not parallelize state-machine and wiring changes.
- Keep old behavior behind a rollout guard until parity tests are green.
- Any newly discovered auth drift gets added to this checklist before merge.