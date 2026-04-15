# Blueprint-Driven Development (extension)

Blueprints are the authoritative contract the extension's code MUST conform to. On every requirements change, the blueprint changes FIRST; then code is updated to match. Never the reverse.

## Hierarchy

| Layer | File | Scope |
|-------|------|-------|
| Messaging | `src/background/messaging/blueprint.ts` | All 19 ProtocolMap keys: handler location, Zod schemas, invariants |
| Per-module | `src/<area>/<module>/blueprint.ts` | Module-owned invariants, events, internal contracts |
| Adapter | `src/ats/<vendor>/blueprint.ts` | Adapter shape, `publicExports`, `forbiddenImports`, vendor invariants |
| Issues | `src/<area>/<module>/blueprint.issues.md` | Bug audit trail per module |
| Types | `src/_blueprints/blueprint.types.ts` | The `ModuleBlueprint` type every blueprint is typed against |

## Blueprint-First (MANDATORY)

- **Bugs**: Read blueprint FIRST -> compare spec vs behavior -> fix code (or update blueprint if the spec was wrong).
- **Features**: Read blueprints -> draft blueprint changes FIRST -> implement to match.
- **Analysis**: Read blueprint -> cross-reference code -> flag drift in writing.

## Drift Detection (on every file read)

Flag silently in the response when a mismatch is observed:

```
WARN [filename:line] BLUEPRINT DRIFT: <module>:<field> says X, <file:line> does Y
```

- Code contradicts blueprint -> drift (fix code).
- Code has behavior not in blueprint -> undocumented (update blueprint or delete code).
- Blueprint has entry with no code backing it -> missing implementation.

## Blueprint Contents (required for every module blueprint)

- `moduleId` + `label` + `description` + `category`
- `messageHandlers[]` (messaging blueprint) OR `publicExports[]` (adapter / module blueprint)
- `forbiddenImports[]` glob patterns (things this module MUST NOT import)
- `invariants[]` with `id`, `description`, `severity`, `check` (runtime or type-level)
- `knownIssues[]` with `id`, `severity`, `status`, `sourceRef`, `fix`
- `sourceRef: 'file:line'` on every claim that points at concrete code

## Maintenance

- Update on: new endpoints / handlers / events, behavior changes, bugs revealing missing invariants, fixed issues.
- `sourceRef` MUST stay current after refactors. `validate:blueprints` rejects stale `file:line` pairs that no longer exist.
- `knownIssues[].status === 'fixed'` requires a linked commit hash in the same entry.

## Related rules

- `code-review-on-read.md` -- silent flags on every file read.
- `extension-boundaries.md` -- hex boundary violations the blueprints encode.
- `protocol-first.md` -- ProtocolMap is the single API surface.
- `compliance-check.md` -- `pnpm compliance` is the enforcement gate.
