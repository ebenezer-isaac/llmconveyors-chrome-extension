#!/usr/bin/env bash
# scripts/rollback-phase-A1.sh
# D23: mechanically reverts phase A1 to the post-A0 / pre-A1 state.
# Run from the project root. Requires git repo to exist.
# NOTE: This rollback PRESERVES the A0 quality-rigor artifacts. A0 has its own
#       rollback script (`scripts/rollback-phase-A0.sh`) for full repo teardown.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

echo "Rolling back phase A1 in $REPO_ROOT (preserving A0 artifacts)"

# Verify we are in the expected repo
if ! grep -q '"name": "llmconveyors-chrome-extension"' package.json 2>/dev/null; then
  echo "ERROR: not inside llmconveyors-chrome-extension repo - refusing to rollback"
  exit 1
fi

# Remove generated build artifacts
rm -rf .output .wxt node_modules dist coverage

# Remove A1-created runtime directories (NOT touching A0 directories)
rm -rf entrypoints public .husky .github

# Remove A1-created files inside tests/ (preserve tests/harness/)
rm -f tests/.gitkeep
rm -rf tests/unit tests/background tests/content tests/entrypoints

# Remove A1-created files inside src/ (preserve src/_blueprints/)
rm -rf src/background

# Remove A1-created files inside scripts/ (preserve scripts/_quality/)
rm -f scripts/check-no-em-dash.sh scripts/check-no-console.sh scripts/check-forbidden-tokens.sh
rm -f scripts/rollback-phase-A1.sh scripts/validate-blueprints.ts scripts/validate-grep-gates.ts
rm -f scripts/generate-protocol-schema.ts

# Remove A1 config files at root
rm -f package.json tsconfig.json wxt.config.ts vitest.config.ts eslint.config.mjs
rm -f .gitattributes .editorconfig .prettierrc.json .nvmrc .npmrc
rm -f LICENSE REMOTE_SETUP.md pnpm-lock.yaml

# Restore minimal A0 .gitignore (A1 expanded it)
cat > .gitignore <<'EOF'
node_modules/
dist/
.output/
.wxt/
coverage/
*.tsbuildinfo
.env
.env.*
!.env.example
.orig
EOF

echo "Phase A1 rolled back cleanly (A0 artifacts preserved)"
