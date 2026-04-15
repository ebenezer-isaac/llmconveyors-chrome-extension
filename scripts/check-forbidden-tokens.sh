#!/usr/bin/env bash
# scripts/check-forbidden-tokens.sh
# D14.1: HighlightRange / IKeywordHighlighter / skill-taxonomy are v1 remnants
# and must never appear in v2.1 code. Core DOM-leak guard runs here too.
set -euo pipefail

# v1 remnant check (all source)
HITS=$(grep -rnE '\b(HighlightRange|IKeywordHighlighter|skill-taxonomy)\b' \
  --include='*.ts' --include='*.tsx' \
  entrypoints/ src/ tests/ 2>/dev/null \
  | grep -v 'src/_blueprints/' || true)
if [ -n "$HITS" ]; then
  echo "V1 REMNANTS (forbidden per D14.1):"
  echo "$HITS"
  exit 1
fi

# Core DOM-leak guard (vacuous in A1 because src/core/ does not exist, but script runs)
if [ -d "src/core" ]; then
  HITS=$(grep -rnE '\b(document|window|HTMLElement|chrome\.)' src/core/ --include='*.ts' 2>/dev/null || true)
  if [ -n "$HITS" ]; then
    echo "CORE LEAK (src/core/ must be DOM-free):"
    echo "$HITS"
    exit 1
  fi
fi

# D4 silent default: no Zovo mention in shipped user-facing artifacts.
# Architect plan docs under docs/plan/ and test-specs that assert absence are excluded.
HITS=$(grep -rniE '\b(zovo|zovo-labs)\b' \
  --include='*.ts' --include='*.tsx' \
  --include='*.md' --include='*.json' \
  --include='*.mjs' --include='*.html' \
  entrypoints/ src/ scripts/ .github/ .claude/ docs/rigor/ \
  README.md LICENSE package.json wxt.config.ts CLAUDE.md MEMORY.md 2>/dev/null || true)
# Allow test files that explicitly assert Zovo is NOT present (D4 enforcement tests).
HITS=$(echo "$HITS" | grep -v "not\.toContain('zovo')" | grep -v "does not mention Zovo" | grep -v "silent default" | grep -vE '^\s*$' || true)
if [ -n "$HITS" ]; then
  echo "ZOVO MENTION (forbidden per D4 silent default):"
  echo "$HITS"
  exit 1
fi

echo "no forbidden tokens"
