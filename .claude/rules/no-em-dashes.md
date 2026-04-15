# No em-dashes

Never use em-dashes (U+2014, long-dash glyph) in any output, anywhere, ever.

This rule applies to:

- Source code (`*.ts`, `*.tsx`, `*.js`, `*.jsx`).
- Markdown (`*.md`).
- JSON (`*.json`).
- HTML / CSS (`*.html`, `*.css`).
- Plan files under `temp/impl/**`.
- Commit messages.
- Pull request titles and descriptions.
- Every tool response.

## Why

- The bash / PowerShell parsers sometimes mis-handle non-ASCII hyphenation, especially on Windows with legacy codepages.
- Em-dashes leak into downstream consumers (grep, diff, regex, JSON parsers) with subtle encoding issues.
- The codebase style is ASCII-only so a single grep for forbidden tokens is reliable.
- Consistency with the main `llmconveyors.com` repo and the `ats-autofill-engine` engine repo.

## Substitution

- For a thought-break dash, use two ASCII hyphens: `--`.
- For a range or compound, use a single ASCII hyphen: `-`.

## Enforcement

Mechanical. The pre-commit hook greps for U+2014 on every staged file:

```
grep -rE $'\xe2\x80\x94' <staged-files>
```

Match count > 0 rejects the commit. CI runs the same grep across the entire repo.

`pnpm validate:grep-gates` includes the em-dash scan.

## Historical context

This rule originated from plan execution failures on PowerShell 5.1 where em-dashes in prompt arguments truncated the script parser and confused orchestrator argument parsing. It was lifted to a global rule because the enforcement cost is zero and the failure cost was non-trivial.

## Exception

None. The rule is absolute. If you see a case that seems to require an em-dash, rewrite the sentence.
