# precommit.spec

Executable specification for `.husky/pre-commit`. A1 installs the hook as part of the WXT scaffold step.

## Contents

```sh
#!/usr/bin/env sh
set -e
pnpm validate:grep-gates --staged-only
pnpm validate:blueprints --staged-only
```

## Behavior

- `--staged-only` scopes both validators to files in `git diff --cached --name-only`.
- Any violation (exit code 1 from either validator) rejects the commit.
- On rejection, the commit did NOT happen. The developer fixes the issue and makes a fresh commit; `--amend` is INCORRECT because there is no prior commit to amend.

## Installation

A1 runs `pnpm dlx husky init` which writes `.husky/pre-commit` as a shell stub, then A1 overwrites it with the content above.

## Not in scope for pre-commit

- `pnpm typecheck` -- too slow for every commit; runs in CI.
- `pnpm test` -- too slow for every commit; runs in CI.
- `pnpm validate:protocol-schema` -- runs in `pnpm rigor:full` and CI.

Rationale: pre-commit gates must complete in under 5 seconds on a cold cache, otherwise developers bypass them with `--no-verify`. Grep gates and staged-only blueprint validation comfortably meet the budget.
