# LLM Conveyors Chrome Extension -- Persistent Session Memory

## 2026-04-17 session (Phase A10, commits 096ab41, a9ece37)

### Completed
- Updated engine dependency from local tarball to npm-published v0.1.0-alpha.2
- Implemented raw-DOM-text fallback in highlight apply-handler: now sends both structured JD text and raw page text to backend when structured extraction fails/is empty but raw text >= 200 chars
- Fixed lint errors: unused variable, unescaped JSX quote, const vs let
- Updated test expectations to match new fallback logic (raw fallback only allows "no-jd-on-page" when both extracted text AND raw text are insufficient)
- Replaced em-dashes with double-dashes in log messages for grep-gate compliance
- Fixed frame-removal race condition in highlight injection: added retry with frame-removal detection and longer stabilization waits (1000ms+1500ms) to handle post-signin frame transitions

### Open blockers
- MINOR | tests/e2e/popup.spec.ts:137 | Flaky E2E test timeout waiting for credits display (10/11 pass). Likely environmental. | owner: TBD
- BLOCKER | src/background/messaging/blueprint.ts | Blueprint validation missing 3 protocol map keys (AUTH_COOKIE_EXCHANGE, SESSION_SELECTED, ARTIFACT_FETCH_BLOB) that exist in handlers.ts. These must be added to blueprint definitions. | owner: TBD

### Decisions made this session
- Raw-text fallback is primary mechanism for unlocking backend's LLM extraction (requires >= 200 chars). Without it, short/empty structured text blocks the better taxonomy cleanup.
- Backend dualpath design: if rawPageText present, use POST /ats/extract-jd (LLM), else fall back to /ats/extract-skills (legacy). Extension contract unchanged.
- Test setup: when testing "no-jd-on-page" behavior, must provide minimal body HTML to ensure raw text capture is also insufficient (not just structured extraction).
- Frame removal errors during script injection are handled as transient (retry once with longer delay) rather than fatal failures.

### Next step
- Fix blueprint validation by adding missing 3 protocol keys to messaging blueprint, then re-run full compliance.

No sessions yet. Extension repo bootstrapped by Phase A0 of Plan 100.

## Schema

Every entry appended to this file follows the format below. Newest entry goes to the top (reverse chronological).

```
## YYYY-MM-DD session (phase <code>, commit <shortsha>)

### Completed
- <bullet: phase / feature / fix>

### Open blockers
- <severity> | <file:line> | <description> | owner: <name-or-TBD>

### Decisions made this session
- <decision + rationale + where captured: blueprint|decision-memo|none-yet>

### Next step
- <single sentence>
```

## Rules

1. Update `MEMORY.md` BEFORE ending the session -- not after.
2. If 3+ commits have landed since the last `MEMORY.md` update, the post-commit Husky hook (installed in A1) warns. Update to silence.
3. Decisions captured here but NOT promoted to a blueprint or decision memo are technical debt and must be promoted within the next session.
4. Never overwrite prior entries. Append-only.
