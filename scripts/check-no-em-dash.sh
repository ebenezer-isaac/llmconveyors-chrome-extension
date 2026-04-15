#!/usr/bin/env bash
# scripts/check-no-em-dash.sh
# D14.1 + D15: fail if any em-dash (U+2014) appears in source or docs.
set -euo pipefail

HITS=$(grep -rl $'\xe2\x80\x94' \
  --include='*.ts' --include='*.tsx' \
  --include='*.md' --include='*.json' \
  --include='*.mjs' --include='*.cjs' \
  --include='*.html' --include='*.css' \
  --include='*.yml' --include='*.yaml' \
  --exclude-dir=node_modules --exclude-dir=.output --exclude-dir=.wxt --exclude-dir=dist --exclude-dir=coverage --exclude-dir=plan \
  entrypoints src tests scripts .github .claude docs/rigor \
  README.md LICENSE CLAUDE.md MEMORY.md package.json tsconfig.json wxt.config.ts vitest.config.ts eslint.config.mjs 2>/dev/null || true)

if [ -n "$HITS" ]; then
  echo "EM DASH FILES:"
  echo "$HITS"
  exit 1
fi
echo "no em-dash hits"
