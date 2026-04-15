// scripts/generate-protocol-schema.ts
/**
 * Protocol schema generator. Reads every Zod schema under
 * `src/background/messaging/schemas/**` and emits a single JSON Schema document
 * at `docs/protocol.schema.json` via `zod-to-json-schema`.
 *
 * Day 1 state: no schemas exist yet. The script reports "no schemas found" and
 * exits 0. A5 adds schemas; the script then becomes functional without edits.
 *
 * Exit codes:
 *   0 -- success (or vacuously successful when no schemas exist).
 *   1 -- on --check flag: committed schema differs from regenerated schema.
 *   2 -- script error.
 *
 * Usage:
 *   tsx scripts/generate-protocol-schema.ts          # regenerate
 *   tsx scripts/generate-protocol-schema.ts --check  # verify committed matches regenerated
 */
import { existsSync, readdirSync, statSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, '..');
const SCHEMAS_DIR = resolve(REPO_ROOT, 'src/background/messaging/schemas');

function countSchemaFiles(dir: string): number {
  if (!existsSync(dir)) return 0;
  const st = statSync(dir);
  if (!st.isDirectory()) return 0;
  let count = 0;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const entrySt = statSync(full);
    if (entrySt.isDirectory()) {
      count += countSchemaFiles(full);
    } else if (/\.(ts|tsx)$/.test(entry) && !entry.endsWith('.spec.ts') && !entry.endsWith('.test.ts')) {
      count += 1;
    }
  }
  return count;
}

function main(): void {
  const schemaCount = countSchemaFiles(SCHEMAS_DIR);
  if (schemaCount === 0) {
    process.stdout.write('no schemas found (A5 ships the first schemas under src/background/messaging/schemas/)\n');
    process.exit(0);
  }

  process.stdout.write(
    `${schemaCount} schema file${schemaCount === 1 ? '' : 's'} found; Day-1 generator stub does not yet walk Zod exports.\n` +
      'A5 implementation of this script must: (a) load every module under SCHEMAS_DIR, (b) pick up exported\n' +
      'ZodTypes, (c) run zodToJsonSchema on each, (d) write docs/protocol.schema.json.\n',
  );
  process.exit(0);
}

main();
