// scripts/validate-blueprints.ts
/**
 * Blueprint validator. Implements the spec at scripts/_quality/validate-blueprints.spec.md.
 *
 * Scans every `**\/blueprint.ts` (excluding `src/_blueprints/` templates and `.wxt`, `node_modules`, `.output`).
 * Parses each with `ts-morph`, validates structure, cross-references ProtocolMap keys where applicable.
 *
 * Exit codes:
 *   0 -- all blueprints clean (or zero blueprints found).
 *   1 -- at least one violation.
 *   2 -- script error (missing dependency, parse crash, etc.).
 *
 * Usage:
 *   tsx scripts/validate-blueprints.ts [--staged-only]
 */
import { Project, SourceFile, SyntaxKind, ObjectLiteralExpression, PropertyAssignment } from 'ts-morph';
import { existsSync, readFileSync, statSync, readdirSync } from 'node:fs';
import { resolve, dirname, relative, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));

type Violation = {
  readonly check: string;
  readonly file: string;
  readonly field: string;
  readonly message: string;
};

const REPO_ROOT = resolve(SCRIPT_DIR, '..');
const STAGED_ONLY = process.argv.includes('--staged-only');

const VALID_ISSUE_STATUS = new Set(['open', 'fixed', 'wontfix']);
const COMMIT_SHA_RE = /^[0-9a-f]{7,40}$/;

function log(msg: string): void {
  process.stdout.write(msg + '\n');
}

function findBlueprintFiles(): readonly string[] {
  if (STAGED_ONLY) {
    try {
      const staged = execSync('git diff --cached --name-only', { encoding: 'utf-8', cwd: REPO_ROOT })
        .split('\n')
        .map((s) => s.trim())
        .filter((s) => s.length > 0 && s.endsWith('blueprint.ts') && !s.startsWith('src/_blueprints/'));
      return staged.map((p) => resolve(REPO_ROOT, p)).filter((p) => existsSync(p));
    } catch {
      return [];
    }
  }

  const matches: string[] = [];
  function walk(dir: string): void {
    if (!existsSync(dir)) return;
    const st = statSync(dir);
    if (!st.isDirectory()) return;
    const name = dir.split(/[\\/]/).pop() ?? '';
    if (['node_modules', '.output', '.wxt', 'dist', 'coverage', '_blueprints'].includes(name)) return;
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const entrySt = statSync(full);
      if (entrySt.isDirectory()) {
        walk(full);
      } else if (entry === 'blueprint.ts') {
        matches.push(full);
      }
    }
  }
  walk(REPO_ROOT);
  return matches;
}

function simpleGlobMatch(pattern: string, dir: string): readonly string[] {
  // Minimal glob support for forbidden-import patterns. Supports `**`, `*`,
  // literal paths. Not a full glob; adequate for Day-1 blueprint checks.
  if (!existsSync(dir)) return [];
  const hits: string[] = [];
  const regexSource = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*\//g, '(?:.*/)?')
    .replace(/\*\*/g, '.*')
    .replace(/\*/g, '[^/]*');
  const re = new RegExp('^' + regexSource + '$');
  function walk(d: string, rel: string): void {
    for (const entry of readdirSync(d)) {
      const full = join(d, entry);
      const relPath = rel ? `${rel}/${entry}` : entry;
      const st = statSync(full);
      if (st.isDirectory()) {
        walk(full, relPath);
      } else if (re.test(relPath)) {
        hits.push(relPath);
      }
    }
  }
  walk(dir, '');
  return hits;
}

function readBlueprintObject(sf: SourceFile): ObjectLiteralExpression | undefined {
  const varDecl = sf.getVariableDeclaration('blueprint');
  if (!varDecl) return undefined;
  const init = varDecl.getInitializer();
  if (!init) return undefined;
  if (init.getKind() === SyntaxKind.ObjectLiteralExpression) {
    return init.asKindOrThrow(SyntaxKind.ObjectLiteralExpression);
  }
  if (init.getKind() === SyntaxKind.AsExpression || init.getKind() === SyntaxKind.SatisfiesExpression) {
    const inner = init.getFirstChildByKind(SyntaxKind.ObjectLiteralExpression);
    return inner;
  }
  return undefined;
}

function getStringArrayProperty(obj: ObjectLiteralExpression, name: string): readonly string[] {
  const prop = obj.getProperty(name);
  if (!prop || prop.getKind() !== SyntaxKind.PropertyAssignment) return [];
  const init = (prop as PropertyAssignment).getInitializer();
  if (!init || init.getKind() !== SyntaxKind.ArrayLiteralExpression) return [];
  return init
    .asKindOrThrow(SyntaxKind.ArrayLiteralExpression)
    .getElements()
    .map((el) => {
      if (el.getKind() === SyntaxKind.StringLiteral) {
        return el.asKindOrThrow(SyntaxKind.StringLiteral).getLiteralValue();
      }
      return '';
    })
    .filter((s) => s.length > 0);
}

function collectSourceRefs(obj: ObjectLiteralExpression): ReadonlyArray<{ file: string; line: number; path: string }> {
  const refs: { file: string; line: number; path: string }[] = [];
  function walk(node: ObjectLiteralExpression, path: string): void {
    for (const prop of node.getProperties()) {
      if (prop.getKind() !== SyntaxKind.PropertyAssignment) continue;
      const pa = prop as PropertyAssignment;
      const key = pa.getName();
      const init = pa.getInitializer();
      if (!init) continue;
      if (key === 'sourceRef' && init.getKind() === SyntaxKind.ObjectLiteralExpression) {
        const inner = init.asKindOrThrow(SyntaxKind.ObjectLiteralExpression);
        const fileProp = inner.getProperty('file');
        const lineProp = inner.getProperty('line');
        if (
          fileProp?.getKind() === SyntaxKind.PropertyAssignment &&
          lineProp?.getKind() === SyntaxKind.PropertyAssignment
        ) {
          const fileInit = (fileProp as PropertyAssignment).getInitializer();
          const lineInit = (lineProp as PropertyAssignment).getInitializer();
          const fileVal =
            fileInit?.getKind() === SyntaxKind.StringLiteral
              ? fileInit.asKindOrThrow(SyntaxKind.StringLiteral).getLiteralValue()
              : '';
          const lineVal =
            lineInit?.getKind() === SyntaxKind.NumericLiteral
              ? Number(lineInit.asKindOrThrow(SyntaxKind.NumericLiteral).getLiteralValue())
              : 0;
          if (fileVal.length > 0) {
            refs.push({ file: fileVal, line: lineVal, path: `${path}.sourceRef` });
          }
        }
      } else if (init.getKind() === SyntaxKind.ObjectLiteralExpression) {
        walk(init.asKindOrThrow(SyntaxKind.ObjectLiteralExpression), `${path}.${key}`);
      } else if (init.getKind() === SyntaxKind.ArrayLiteralExpression) {
        const arr = init.asKindOrThrow(SyntaxKind.ArrayLiteralExpression);
        arr.getElements().forEach((el, idx) => {
          if (el.getKind() === SyntaxKind.ObjectLiteralExpression) {
            walk(el.asKindOrThrow(SyntaxKind.ObjectLiteralExpression), `${path}.${key}[${idx}]`);
          }
        });
      }
    }
  }
  walk(obj, 'blueprint');
  return refs;
}

function collectKnownIssues(obj: ObjectLiteralExpression): ReadonlyArray<{ status: string; fixedInCommit: string | null; index: number }> {
  const result: { status: string; fixedInCommit: string | null; index: number }[] = [];
  const prop = obj.getProperty('knownIssues');
  if (!prop || prop.getKind() !== SyntaxKind.PropertyAssignment) return result;
  const init = (prop as PropertyAssignment).getInitializer();
  if (!init || init.getKind() !== SyntaxKind.ArrayLiteralExpression) return result;
  const arr = init.asKindOrThrow(SyntaxKind.ArrayLiteralExpression);
  arr.getElements().forEach((el, idx) => {
    if (el.getKind() !== SyntaxKind.ObjectLiteralExpression) return;
    const issueObj = el.asKindOrThrow(SyntaxKind.ObjectLiteralExpression);
    const statusProp = issueObj.getProperty('status');
    const fixedProp = issueObj.getProperty('fixedInCommit');
    let status = '';
    if (statusProp?.getKind() === SyntaxKind.PropertyAssignment) {
      const s = (statusProp as PropertyAssignment).getInitializer();
      if (s?.getKind() === SyntaxKind.StringLiteral) {
        status = s.asKindOrThrow(SyntaxKind.StringLiteral).getLiteralValue();
      }
    }
    let fixedInCommit: string | null = null;
    if (fixedProp?.getKind() === SyntaxKind.PropertyAssignment) {
      const f = (fixedProp as PropertyAssignment).getInitializer();
      if (f?.getKind() === SyntaxKind.StringLiteral) {
        fixedInCommit = f.asKindOrThrow(SyntaxKind.StringLiteral).getLiteralValue();
      }
    }
    result.push({ status, fixedInCommit, index: idx });
  });
  return result;
}

function lineCount(file: string): number {
  try {
    return readFileSync(file, 'utf-8').split('\n').length;
  } catch {
    return 0;
  }
}

function findBarrelExports(blueprintDir: string): readonly string[] {
  const candidates = [join(blueprintDir, 'index.ts'), `${blueprintDir}.ts`];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      try {
        const project = new Project({ skipAddingFilesFromTsConfig: true });
        const sf = project.addSourceFileAtPath(candidate);
        const exports: string[] = [];
        sf.getExportedDeclarations().forEach((_, name) => {
          exports.push(name);
        });
        return exports;
      } catch {
        return [];
      }
    }
  }
  return [];
}

function findProtocolMapKeys(): readonly string[] {
  const protocolFile = resolve(REPO_ROOT, 'src/background/messaging/protocol.ts');
  if (!existsSync(protocolFile)) return [];
  try {
    const project = new Project({ skipAddingFilesFromTsConfig: true });
    const sf = project.addSourceFileAtPath(protocolFile);
    const iface = sf.getInterface('ProtocolMap');
    if (!iface) return [];
    return iface.getProperties().map((p) => p.getName().replace(/^['"]|['"]$/g, ''));
  } catch {
    return [];
  }
}

function main(): void {
  const files = findBlueprintFiles();
  if (files.length === 0) {
    log('0 blueprints found, 0 violations');
    process.exit(0);
  }

  log(`${files.length} blueprint${files.length === 1 ? '' : 's'} found, validating...`);

  const project = new Project({ skipAddingFilesFromTsConfig: true });
  const violations: Violation[] = [];

  for (const absPath of files) {
    const relPath = relative(REPO_ROOT, absPath).replace(/\\/g, '/');
    const blueprintDir = dirname(absPath);

    let sf: SourceFile;
    try {
      sf = project.addSourceFileAtPath(absPath);
    } catch (err) {
      violations.push({
        check: 'parse',
        file: relPath,
        field: '',
        message: `failed to parse: ${String(err)}`,
      });
      continue;
    }

    const obj = readBlueprintObject(sf);
    if (!obj) {
      violations.push({
        check: 'structure',
        file: relPath,
        field: 'blueprint',
        message: 'missing `export const blueprint: ModuleBlueprint = { ... }`',
      });
      continue;
    }

    // Check 2: publicExports must match barrel exports
    const publicExports = getStringArrayProperty(obj, 'publicExports');
    if (publicExports.length > 0) {
      const barrelExports = new Set(findBarrelExports(blueprintDir));
      for (const name of publicExports) {
        if (!barrelExports.has(name)) {
          violations.push({
            check: 'publicExports',
            file: relPath,
            field: `publicExports[${name}]`,
            message: `declared export '${name}' not found in module barrel`,
          });
        }
      }
    }

    // Check 3: forbiddenImports must match zero files (glob scan against blueprint dir tree)
    const forbidden = getStringArrayProperty(obj, 'forbiddenImports');
    for (const pattern of forbidden) {
      try {
        const hits = simpleGlobMatch(pattern, blueprintDir);
        if (hits.length > 0) {
          violations.push({
            check: 'forbiddenImports',
            file: relPath,
            field: `forbiddenImports[${pattern}]`,
            message: `${hits.length} file(s) match forbidden glob: ${hits.slice(0, 3).join(', ')}`,
          });
        }
      } catch {
        // invalid glob; ignore silently
      }
    }

    // Check 4: sourceRef file+line must resolve
    for (const ref of collectSourceRefs(obj)) {
      const refAbs = resolve(blueprintDir, ref.file);
      const repoRelAbs = resolve(REPO_ROOT, ref.file);
      const resolved = existsSync(refAbs) ? refAbs : existsSync(repoRelAbs) ? repoRelAbs : null;
      if (!resolved) {
        violations.push({
          check: 'sourceRef',
          file: relPath,
          field: ref.path,
          message: `file '${ref.file}' not found`,
        });
        continue;
      }
      const lines = lineCount(resolved);
      if (ref.line < 1 || ref.line > lines) {
        violations.push({
          check: 'sourceRef',
          file: relPath,
          field: ref.path,
          message: `line ${ref.line} out of range (1..${lines}) in ${ref.file}`,
        });
      }
    }

    // Check 6: knownIssues status validity
    for (const issue of collectKnownIssues(obj)) {
      if (!VALID_ISSUE_STATUS.has(issue.status)) {
        violations.push({
          check: 'knownIssues.status',
          file: relPath,
          field: `knownIssues[${issue.index}].status`,
          message: `invalid status '${issue.status}' (expected open | fixed | wontfix)`,
        });
      }
      if (issue.status === 'fixed') {
        if (!issue.fixedInCommit) {
          violations.push({
            check: 'knownIssues.fixedInCommit',
            file: relPath,
            field: `knownIssues[${issue.index}].fixedInCommit`,
            message: `status=fixed requires fixedInCommit`,
          });
        } else if (!COMMIT_SHA_RE.test(issue.fixedInCommit)) {
          violations.push({
            check: 'knownIssues.fixedInCommit',
            file: relPath,
            field: `knownIssues[${issue.index}].fixedInCommit`,
            message: `fixedInCommit '${issue.fixedInCommit}' is not a valid commit hash`,
          });
        }
      }
    }

    // Check 5: ProtocolMap key parity (messaging blueprint only; informational until A5 lands)
    if (relPath.includes('messaging/blueprint.ts')) {
      const mapKeys = new Set(findProtocolMapKeys());
      if (mapKeys.size === 0) {
        log(`  ${relPath}: ProtocolMap not found yet (A5 deliverable); skipping parity check`);
      } else {
        const handlerKeysProp = obj.getProperty('messageHandlers');
        const handlerKeys = new Set<string>();
        if (handlerKeysProp?.getKind() === SyntaxKind.PropertyAssignment) {
          const init = (handlerKeysProp as PropertyAssignment).getInitializer();
          if (init?.getKind() === SyntaxKind.ArrayLiteralExpression) {
            const arr = init.asKindOrThrow(SyntaxKind.ArrayLiteralExpression);
            arr.getElements().forEach((el) => {
              if (el.getKind() !== SyntaxKind.ObjectLiteralExpression) return;
              const o = el.asKindOrThrow(SyntaxKind.ObjectLiteralExpression);
              const keyProp = o.getProperty('key');
              if (keyProp?.getKind() === SyntaxKind.PropertyAssignment) {
                const k = (keyProp as PropertyAssignment).getInitializer();
                if (k?.getKind() === SyntaxKind.StringLiteral) {
                  handlerKeys.add(k.asKindOrThrow(SyntaxKind.StringLiteral).getLiteralValue());
                }
              }
            });
          }
        }
        for (const k of mapKeys) {
          if (!handlerKeys.has(k)) {
            violations.push({
              check: 'protocolMap',
              file: relPath,
              field: `messageHandlers`,
              message: `ProtocolMap key '${k}' missing from blueprint`,
            });
          }
        }
        for (const k of handlerKeys) {
          if (!mapKeys.has(k)) {
            violations.push({
              check: 'protocolMap',
              file: relPath,
              field: `messageHandlers[${k}]`,
              message: `blueprint key '${k}' missing from ProtocolMap`,
            });
          }
        }
      }
    }
  }

  violations.sort((a, b) => (a.file + a.field).localeCompare(b.file + b.field));

  for (const v of violations) {
    log(`VIOLATION [${v.check}] ${v.file}:${v.field}: ${v.message}`);
  }

  log(`${files.length} blueprint${files.length === 1 ? '' : 's'} scanned, ${violations.length} violation${violations.length === 1 ? '' : 's'}`);

  process.exit(violations.length === 0 ? 0 : 1);
}

try {
  main();
} catch (err) {
  process.stderr.write(`validate-blueprints error: ${String(err)}\n`);
  if (err instanceof Error && err.stack) {
    process.stderr.write(err.stack + '\n');
  }
  process.exit(2);
}
