# validate-blueprints.spec

Executable specification for `scripts/validate-blueprints.ts`. A1 implements this script as TypeScript (~180 LOC). The checks below are mandatory; adding checks is allowed, removing is not.

## Invocation

```
tsx scripts/validate-blueprints.ts [--staged-only]
```

- No flags: scan every `**/blueprint.ts` in the repo.
- `--staged-only`: limit scan to files in `git diff --cached --name-only` (pre-commit use).

## Checks (all 7 MUST run; any failure exits 1)

1. **Typecheck every `blueprint.ts`**: parse each with `ts-morph`. Resolve its import of `ModuleBlueprint` from `src/_blueprints/blueprint.types.ts`. Verify the exported `const blueprint` satisfies the `ModuleBlueprint` shape. A structural mismatch fails this check.

2. **`publicExports` matches the module barrel**: for each blueprint, resolve the barrel at `<blueprint-dir>/index.ts` (or `<blueprint-dir>.ts` if no directory). Parse exported identifiers. Every string in `blueprint.publicExports` MUST appear as an exported identifier. Missing identifier -> fail.

3. **`forbiddenImports` matches zero files**: for each glob in `blueprint.forbiddenImports`, run `glob(pattern, { cwd: <blueprint-dir> })`. Additionally parse the TypeScript import graph rooted at the module barrel; any transitive import matching the glob is a hit. Hit count > 0 -> fail.

4. **`sourceRef: { file, line }` resolves**: for every `sourceRef` in the blueprint (at module root, in invariants, in knownIssues, in messageHandlers), verify `file` exists and `line >= 1 && line <= <lineCount(file)>`. Missing file or out-of-range line -> fail.

5. **ProtocolMap key parity** (messaging blueprint only): parse `src/background/messaging/protocol.ts`, extract the set of `ProtocolMap` keys. Compare to the set of `messageHandlers[].key` in the messaging blueprint. The two sets MUST be equal. Missing key in either direction -> fail. Duplicate key in blueprint -> fail.

6. **`knownIssues[].status` validity**: every issue has `status in ['open', 'fixed', 'wontfix']`. If `status === 'fixed'`, `fixedInCommit` MUST be present and MUST match `^[0-9a-f]{7,40}$`. Either missing `fixedInCommit` or invalid hash -> fail.

7. **Handler location consistency** (messaging blueprint only): for each `messageHandlers[]` entry, verify an `onMessage(<key>, ...)` registration exists at the declared `handlerLocation`. `handlerLocation: 'background'` -> grep `src/background/messaging/handlers.ts` for `'onMessage(''${key}''`. `handlerLocation: 'content'` -> grep `src/content/**/handlers.ts`. `handlerLocation: 'popup'` -> grep `src/popup/**/handlers.ts`. Missing registration -> fail.

## Exit codes

- `0` -- all blueprints clean.
- `1` -- at least one check failed. Prints `VIOLATION [<check-name>] <blueprint-path>:<field>: <message>` per failure.
- `2` -- script error (broken import, missing `ts-morph`, etc.). Prints stack to stderr.

## Performance

On a 500-file repo expected runtime is ~25s (dominated by `ts-morph` parsing). Acceptable for pre-commit + CI. Not suitable for watch mode.

## Implementation notes for A1

- Use `ts-morph` v24 `Project.addSourceFilesAtPaths('**/blueprint.ts')`.
- Cache the `ModuleBlueprint` type symbol once per run.
- For ProtocolMap parity (check 5), parse the `ProtocolMap` interface declaration and enumerate its `PropertySignature` nodes.
- Emit violations with stable sort (by blueprint path then field name) so CI diffs stay readable.
