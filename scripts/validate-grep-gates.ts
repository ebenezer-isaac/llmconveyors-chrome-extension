// scripts/validate-grep-gates.ts
/**
 * Grep-gate validator. Implements the spec at scripts/_quality/validate-grep-gates.spec.md.
 *
 * Fast Layer-1 forbidden-token scan by path glob. Single pass through the repo; emits one
 * line per violation in `GATE [<rule#>] <file>:<line>: <match>` format.
 *
 * Exit codes:
 *   0 -- zero error-severity hits.
 *   1 -- at least one error hit.
 *
 * Usage:
 *   tsx scripts/validate-grep-gates.ts [--staged-only]
 */
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { resolve, relative, join, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { Project, SyntaxKind } from 'ts-morph';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, '..');
const STAGED_ONLY = process.argv.includes('--staged-only');

type Severity = 'error' | 'warn';
type Rule = {
  readonly id: number;
  readonly includes: readonly RegExp[];
  readonly excludes?: readonly RegExp[];
  readonly pattern: RegExp;
  readonly message: string;
  readonly severity: Severity;
  readonly astOnly?: boolean;
};

const RULES: readonly Rule[] = [
  {
    id: 1,
    includes: [/^src\/core\//],
    pattern: /\b(document|window|HTMLElement|chrome\.)/,
    message: 'Core is pure; DOM / chrome forbidden',
    severity: 'error',
  },
  {
    id: 2,
    includes: [/^entrypoints\//, /^src\/background\//, /^src\/content\//],
    excludes: [/^src\/background\/log\.ts$/, /^src\/_blueprints\//],
    pattern: /\bconsole\.(log|info|warn|error|debug)\b/,
    message: 'Use createLogger(scope) from src/background/log.ts',
    severity: 'error',
  },
  {
    id: 3,
    includes: [/\.(ts|tsx|md|json)$/],
    excludes: [
      /^node_modules\//,
      /^\.wxt\//,
      /^\.output\//,
      /^dist\//,
      /^coverage\//,
      /^pnpm-lock\.yaml$/,
      /^docs\/plan\//,
    ],
    pattern: /\u2014/,
    message: 'No em-dashes; use - or --',
    severity: 'error',
  },
  {
    id: 4,
    includes: [/^src\/ats\//],
    pattern: /import[^;]*['"](?:\.\.\/){2,}ats\//,
    message: 'No cross-adapter imports',
    severity: 'error',
  },
  {
    id: 5,
    includes: [
      /^entrypoints\/content\//,
      /^entrypoints\/popup\//,
      /^entrypoints\/sidepanel\//,
      /^entrypoints\/options\//,
    ],
    pattern: /\bfetch\s*\(/,
    message: 'UI / content must route network through background',
    severity: 'error',
  },
  {
    id: 6,
    includes: [/\.(ts|tsx)$/],
    excludes: [/^node_modules\//, /^\.wxt\//, /^\.output\//, /^src\/_blueprints\//, /^scripts\//],
    pattern: /\b(TODO|FIXME|HACK)\b(?!.*#\d+)/,
    message: 'TODO / FIXME / HACK without linked issue ref (#NNN)',
    severity: 'error',
  },
  {
    id: 7,
    includes: [
      /^src\/background\//,
      /^src\/content\//,
      /^src\/popup\//,
      /^src\/sidepanel\//,
      /^src\/options\//,
    ],
    excludes: [/^src\/_blueprints\//],
    pattern: /\bany\b/,
    message: 'No `any`; use `unknown`',
    severity: 'error',
    astOnly: true,
  },
  {
    id: 8,
    includes: [/\.md$/],
    excludes: [/^node_modules\//, /^docs\/plan\//],
    pattern: /\u2014/,
    message: 'No em-dashes in docs',
    severity: 'error',
  },
];

function listAllFiles(): readonly string[] {
  const out: string[] = [];
  function walk(dir: string): void {
    if (!existsSync(dir)) return;
    const st = statSync(dir);
    if (!st.isDirectory()) return;
    const name = dir.split(/[\\/]/).pop() ?? '';
    if (['node_modules', '.output', '.wxt', 'dist', 'coverage', '.git'].includes(name)) return;
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      try {
        const entrySt = statSync(full);
        if (entrySt.isDirectory()) {
          walk(full);
        } else if (entrySt.isFile()) {
          out.push(full);
        }
      } catch {
        // skip unreadable entries
      }
    }
  }
  walk(REPO_ROOT);
  return out;
}

function listStagedFiles(): readonly string[] {
  try {
    const staged = execSync('git diff --cached --name-only', { encoding: 'utf-8', cwd: REPO_ROOT })
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    return staged.map((p) => resolve(REPO_ROOT, p)).filter((p) => existsSync(p));
  } catch {
    return [];
  }
}

type Hit = { readonly ruleId: number; readonly file: string; readonly line: number; readonly match: string; readonly severity: Severity };

function astScanForAny(absPath: string, relPath: string, rule: Rule): readonly Hit[] {
  const hits: Hit[] = [];
  if (!/\.(ts|tsx)$/.test(absPath)) return hits;
  try {
    const project = new Project({ skipAddingFilesFromTsConfig: true, compilerOptions: { allowJs: false } });
    const sf = project.addSourceFileAtPath(absPath);
    sf.forEachDescendant((node) => {
      if (node.getKind() === SyntaxKind.AnyKeyword) {
        const { line } = sf.getLineAndColumnAtPos(node.getStart());
        hits.push({
          ruleId: rule.id,
          file: relPath,
          line,
          match: 'any',
          severity: rule.severity,
        });
      }
    });
  } catch {
    // parse failure; skip silently
  }
  return hits;
}

function scanFile(absPath: string, rule: Rule): readonly Hit[] {
  const rel = relative(REPO_ROOT, absPath).replace(/\\/g, '/');

  if (!rule.includes.some((re) => re.test(rel))) return [];
  if (rule.excludes?.some((re) => re.test(rel))) return [];

  if (rule.astOnly) {
    return astScanForAny(absPath, rel, rule);
  }

  let content: string;
  try {
    content = readFileSync(absPath, 'utf-8');
  } catch {
    return [];
  }

  const hits: Hit[] = [];
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (rule.pattern.test(line)) {
      const match = line.match(rule.pattern);
      hits.push({
        ruleId: rule.id,
        file: rel,
        line: i + 1,
        match: (match?.[0] ?? '').trim().slice(0, 80),
        severity: rule.severity,
      });
    }
  }
  return hits;
}

function main(): void {
  const files = STAGED_ONLY ? listStagedFiles() : listAllFiles();
  const allHits: Hit[] = [];

  for (const abs of files) {
    const rel = relative(REPO_ROOT, abs).replace(/\\/g, '/');
    if (rel.startsWith('.git' + '/')) continue;
    for (const rule of RULES) {
      const hits = scanFile(abs, rule);
      allHits.push(...hits);
    }
  }

  allHits.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);

  let errorCount = 0;
  for (const h of allHits) {
    process.stdout.write(`GATE [${h.ruleId}] ${h.file}:${h.line}: ${h.match}\n`);
    if (h.severity === 'error') errorCount++;
  }

  if (allHits.length === 0) {
    process.stdout.write(`${files.length} file${files.length === 1 ? '' : 's'} scanned, 0 violations\n`);
  } else {
    process.stdout.write(`${files.length} files scanned, ${allHits.length} hit${allHits.length === 1 ? '' : 's'} (${errorCount} error)\n`);
  }

  process.exit(errorCount === 0 ? 0 : 1);
}

main();
// guard against the literal token "any" being interpreted as a rule 7 hit in this file:
// this file is under scripts/, excluded from rule 7 by scripts/ path convention (scripts/** not in includes list).
void sep; // keep sep import used
