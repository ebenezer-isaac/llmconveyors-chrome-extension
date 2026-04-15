#!/usr/bin/env bash
# scripts/check-no-console.sh
# D11: no console.* in extension code. Only src/background/log.ts is allowed.
set -euo pipefail

HITS=$(grep -rnE '\bconsole\.(log|info|warn|error|debug)' \
  --include='*.ts' --include='*.tsx' \
  entrypoints/ src/ 2>/dev/null \
  | grep -v 'src/background/log.ts' \
  | grep -v 'src/_blueprints/' \
  | grep -v 'eslint-disable' || true)

if [ -n "$HITS" ]; then
  echo "CONSOLE.* USAGE (forbidden per D11):"
  echo "$HITS"
  exit 1
fi
echo "no console.* hits"
