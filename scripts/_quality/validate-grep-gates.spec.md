# validate-grep-gates.spec

Executable specification for `scripts/validate-grep-gates.ts`. A1 implements as TypeScript (~90 LOC). Fast Layer-1 enforcement of forbidden tokens by path glob.

## Invocation

```
tsx scripts/validate-grep-gates.ts [--staged-only]
```

- No flags: scan the full repo per rules below.
- `--staged-only`: limit to staged files for pre-commit.

## Rules

Each rule is `(pathGlob, forbiddenPattern, message, severity)`. Severity `error` exits 1 on hit; `warn` prints the hit but does not exit non-zero.

| # | Path glob | Forbidden pattern (ECMAScript regex) | Message | Severity |
|---|-----------|--------------------------------------|---------|----------|
| 1 | `src/core/**` | `\b(document\|window\|HTMLElement\|chrome\.)` | Core is pure; DOM / chrome forbidden | error |
| 2 | `entrypoints/**, src/background/**, src/content/**` | `\bconsole\.(log\|info\|warn\|error\|debug)\b` | Use createLogger(scope) from src/background/log.ts | error |
| 3 | `**/*.ts, **/*.tsx, **/*.md, **/*.json` | `\u2014` (em-dash) | No em-dashes; use `-` or `--` | error |
| 4 | `src/ats/**` | `import[^;]*['"](?:\.\.\/){2,}ats\/(?!\<self\>)` | No cross-adapter imports | error |
| 5 | `entrypoints/content/**, entrypoints/popup/**, entrypoints/sidepanel/**, entrypoints/options/**` | `\bfetch\s*\(` | UI / content must route network through background | error |
| 6 | `**/*.ts, **/*.tsx` | `\b(TODO\|FIXME\|HACK)\b(?!.*#\d+)` | TODO / FIXME / HACK without linked issue ref (#NNN) | error |
| 7 | `src/background/**, src/content/**, src/popup/**, src/sidepanel/**, src/options/**` | `\bany\b(?![A-Za-z_])` (type position only) | No `any`; use `unknown` | error |
| 8 | `**/*.md` | `\u2014` (redundant with 3 but runs on prose only for clarity) | No em-dashes in docs | error |

Rule 4 `<self>` is computed per-adapter: a file at `src/ats/greenhouse/...` must not import `src/ats/lever/...` or `src/ats/workday/...`, but MAY import from `src/ats/greenhouse/...`.

Rule 7 must use TypeScript AST parsing to distinguish `any` as a type (error) from `any` as an identifier (allowed). Simple grep produces false positives on `Array.any` / `.every(any => ...)`. A1 uses `ts-morph` for this rule specifically.

## Exit codes

- `0` -- no hits or only warnings.
- `1` -- at least one error-severity hit. Prints `GATE [<rule#>] <file>:<line>: <match>` per hit.

## Output format

One violation per line, pipe-grep-friendly:

```
GATE [5] entrypoints/sidepanel/App.tsx:42: fetch(
GATE [1] src/core/url.ts:8: chrome.runtime.getManifest()
```
