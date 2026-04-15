# Compliance Check (extension)

```bash
pnpm compliance
```

Runs in order: `typecheck` -> `lint` -> `test` -> `validate:blueprints` -> `validate:grep-gates`. The extended gauntlet `pnpm rigor:full` additionally runs `validate:protocol-schema` (A5+).

## When (MANDATORY)

- Before every commit.
- After every refactor (even a rename).
- After every dependency change (adding / removing an `ats-autofill-engine` sub-entry, upgrading WXT).
- Before opening a PR.
- After resolving a merge conflict.

## Every phase plan ends with

```
- [ ] Run `pnpm compliance` -- all checks must pass with zero errors and zero warnings
- [ ] Run `pnpm validate:protocol-schema` if ProtocolMap changed -- must exit 0
```

## Failure protocol

- NEVER ad-hoc-edit to make a check pass.
- Produce a corrective plan that locates the root cause. Fix the cause, not the symptom.
- Type errors: supply the exact fix, never `any` / `@ts-ignore` / `// @ts-expect-error`.
- Test failures: investigate the real defect. If the test was right, fix the code. If the test was wrong, fix the test AND update the blueprint that implicitly informed it.
- Validator failures: either update the code to match the blueprint, OR update the blueprint FIRST (blueprint-first rule in `blueprint-driven-development.md`) and the code second.
- Grep-gate failures: remove the forbidden token. If a forbidden token is actually necessary (very rare), the rule is wrong -- update the rule in a separate PR and document the decision.

## Interaction with Husky pre-commit

A1 installs `.husky/pre-commit` which runs `pnpm validate:grep-gates` + `pnpm validate:blueprints --staged-only` + em-dash check on staged files. A failed pre-commit hook means the commit did not happen; do NOT `--amend` afterward -- fix and make a fresh commit.
