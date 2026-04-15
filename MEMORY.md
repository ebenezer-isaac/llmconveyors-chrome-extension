# LLM Conveyors Chrome Extension -- Persistent Session Memory

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
