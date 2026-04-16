// SPDX-License-Identifier: MIT
/**
 * Protocol schema generator.
 *
 * Loads every Zod schema exported from src/background/messaging/schemas/
 * and emits a single JSON Schema document at docs/protocol.schema.json plus
 * a human-readable catalog at docs/protocol.md.
 *
 * Exit codes:
 *   0 - success (or --check success)
 *   1 - --check: committed schema differs from regenerated output
 *   2 - script error
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { z } from 'zod';
import type { JSONSchema7 } from 'json-schema';
import {
  rewriteDiscriminatedUnions,
  type DiscriminatedMeta,
} from './_lib/define-discriminated-union';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, '..');
const DOCS_DIR = resolve(REPO_ROOT, 'docs');
const OUT_JSON = resolve(DOCS_DIR, 'protocol.schema.json');
const OUT_MD = resolve(DOCS_DIR, 'protocol.md');

const CHECK_MODE = process.argv.includes('--check');

type SchemaPair = {
  readonly key: string;
  readonly requestSchema: z.ZodTypeAny | null | undefined;
  readonly responseSchema: z.ZodTypeAny | null | undefined;
  readonly handlerLocation: 'background' | 'content';
  readonly broadcastOnly: boolean;
};

async function loadModules(): Promise<{
  readonly pairs: readonly SchemaPair[];
  readonly meta: ReadonlyMap<string, DiscriminatedMeta>;
}> {
  const defineDuUrl = pathToFileURL(
    resolve(
      REPO_ROOT,
      'src/background/messaging/schemas/define-discriminated-union.ts',
    ),
  ).href;
  const defineDuMod = (await import(defineDuUrl)) as {
    readonly DISCRIMINATED_META: Map<string, DiscriminatedMeta>;
  };

  const authUrl = pathToFileURL(
    resolve(REPO_ROOT, 'src/background/messaging/schemas/auth.schema.ts'),
  ).href;
  const intentUrl = pathToFileURL(
    resolve(REPO_ROOT, 'src/background/messaging/schemas/intent.schema.ts'),
  ).href;
  const fillUrl = pathToFileURL(
    resolve(REPO_ROOT, 'src/background/messaging/schemas/fill.schema.ts'),
  ).href;
  const keywordsUrl = pathToFileURL(
    resolve(REPO_ROOT, 'src/background/messaging/schemas/keywords.schema.ts'),
  ).href;
  const highlightUrl = pathToFileURL(
    resolve(REPO_ROOT, 'src/background/messaging/schemas/highlight.schema.ts'),
  ).href;
  const generationUrl = pathToFileURL(
    resolve(REPO_ROOT, 'src/background/messaging/schemas/generation.schema.ts'),
  ).href;
  const creditsUrl = pathToFileURL(
    resolve(REPO_ROOT, 'src/background/messaging/schemas/credits.schema.ts'),
  ).href;
  const profileUrl = pathToFileURL(
    resolve(REPO_ROOT, 'src/background/messaging/schemas/profile.schema.ts'),
  ).href;
  const sessionListUrl = pathToFileURL(
    resolve(REPO_ROOT, 'src/background/messaging/schemas/session-list.schema.ts'),
  ).href;
  const sessionBindingUrl = pathToFileURL(
    resolve(REPO_ROOT, 'src/background/messaging/schemas/session-binding.schema.ts'),
  ).href;
  const genericIntentUrl = pathToFileURL(
    resolve(REPO_ROOT, 'src/background/messaging/schemas/generic-intent.schema.ts'),
  ).href;

  type SchemaModule = Record<string, z.ZodTypeAny>;
  const auth = (await import(authUrl)) as SchemaModule;
  const intent = (await import(intentUrl)) as SchemaModule;
  const fill = (await import(fillUrl)) as SchemaModule;
  const keywords = (await import(keywordsUrl)) as SchemaModule;
  const highlight = (await import(highlightUrl)) as SchemaModule;
  const generation = (await import(generationUrl)) as SchemaModule;
  const credits = (await import(creditsUrl)) as SchemaModule;
  const profile = (await import(profileUrl)) as SchemaModule;
  const sessionList = (await import(sessionListUrl)) as SchemaModule;
  const sessionBinding = (await import(sessionBindingUrl)) as SchemaModule;
  const genericIntent = (await import(genericIntentUrl)) as SchemaModule;

  const pairs: SchemaPair[] = [
    // Auth
    {
      key: 'AUTH_SIGN_IN',
      requestSchema: auth.AuthSignInRequestSchema,
      responseSchema: auth.AuthSignInResponseSchema,
      handlerLocation: 'background',
      broadcastOnly: false,
    },
    {
      key: 'AUTH_SIGN_OUT',
      requestSchema: auth.AuthSignOutRequestSchema,
      responseSchema: auth.AuthSignOutResponseSchema,
      handlerLocation: 'background',
      broadcastOnly: false,
    },
    {
      key: 'AUTH_STATUS',
      requestSchema: auth.AuthStatusRequestSchema,
      responseSchema: auth.AuthStateSchema,
      handlerLocation: 'background',
      broadcastOnly: false,
    },
    {
      key: 'AUTH_STATE_CHANGED',
      requestSchema: auth.AuthStateSchema,
      responseSchema: null,
      handlerLocation: 'background',
      broadcastOnly: true,
    },
    // Intent
    {
      key: 'INTENT_DETECTED',
      requestSchema: intent.DetectedIntentPayloadSchema,
      responseSchema: null,
      handlerLocation: 'background',
      broadcastOnly: false,
    },
    {
      key: 'INTENT_GET',
      requestSchema: intent.IntentGetRequestSchema,
      responseSchema: intent.IntentGetResponseSchema,
      handlerLocation: 'background',
      broadcastOnly: false,
    },
    // Fill
    {
      key: 'FILL_REQUEST',
      requestSchema: fill.FillRequestSchema,
      responseSchema: fill.FillRequestResponseSchema,
      handlerLocation: 'background',
      broadcastOnly: false,
    },
    // Keywords
    {
      key: 'KEYWORDS_EXTRACT',
      requestSchema: keywords.KeywordsExtractRequestSchema,
      responseSchema: keywords.KeywordsExtractResponseSchema,
      handlerLocation: 'background',
      broadcastOnly: false,
    },
    // Highlight
    {
      key: 'HIGHLIGHT_APPLY',
      requestSchema: highlight.HighlightApplyRequestSchema,
      responseSchema: highlight.HighlightApplyResponseSchema,
      handlerLocation: 'content',
      broadcastOnly: false,
    },
    {
      key: 'HIGHLIGHT_CLEAR',
      requestSchema: highlight.HighlightClearRequestSchema,
      responseSchema: highlight.HighlightClearResponseSchema,
      handlerLocation: 'content',
      broadcastOnly: false,
    },
    {
      key: 'HIGHLIGHT_STATUS',
      requestSchema: highlight.HighlightStatusRequestSchema,
      responseSchema: highlight.HighlightStatusSchema,
      handlerLocation: 'background',
      broadcastOnly: false,
    },
    // Generation
    {
      key: 'GENERATION_START',
      requestSchema: generation.GenerationStartRequestSchema,
      responseSchema: generation.GenerationStartResponseSchema,
      handlerLocation: 'background',
      broadcastOnly: false,
    },
    {
      key: 'GENERATION_UPDATE',
      requestSchema: generation.GenerationUpdateBroadcastSchema,
      responseSchema: null,
      handlerLocation: 'background',
      broadcastOnly: true,
    },
    {
      key: 'GENERATION_CANCEL',
      requestSchema: generation.GenerationCancelRequestSchema,
      responseSchema: generation.GenerationCancelResponseSchema,
      handlerLocation: 'background',
      broadcastOnly: false,
    },
    {
      key: 'GENERATION_SUBSCRIBE',
      requestSchema: generation.GenerationSubscribeRequestSchema,
      responseSchema: generation.GenerationSubscribeResponseSchema,
      handlerLocation: 'background',
      broadcastOnly: false,
    },
    {
      key: 'GENERATION_INTERACT',
      requestSchema: generation.GenerationInteractRequestSchema,
      responseSchema: generation.GenerationInteractResponseSchema,
      handlerLocation: 'background',
      broadcastOnly: false,
    },
    {
      key: 'GENERATION_STARTED',
      requestSchema: null,
      responseSchema: null,
      handlerLocation: 'background',
      broadcastOnly: true,
    },
    {
      key: 'GENERATION_COMPLETE',
      requestSchema: null,
      responseSchema: null,
      handlerLocation: 'background',
      broadcastOnly: true,
    },
    // Broadcast
    {
      key: 'DETECTED_JOB_BROADCAST',
      requestSchema: intent.DetectedJobBroadcastSchema,
      responseSchema: null,
      handlerLocation: 'background',
      broadcastOnly: true,
    },
    // Credits
    {
      key: 'CREDITS_GET',
      requestSchema: credits.CreditsGetRequestSchema,
      responseSchema: credits.ClientCreditsSnapshotSchema,
      handlerLocation: 'background',
      broadcastOnly: false,
    },
    // Profile
    {
      key: 'PROFILE_GET',
      requestSchema: profile.ProfileGetRequestSchema,
      responseSchema: profile.ClientProfileSnapshotSchema,
      handlerLocation: 'background',
      broadcastOnly: false,
    },
    // Sessions
    {
      key: 'SESSION_LIST',
      requestSchema: sessionList.SessionListRequestSchema,
      responseSchema: sessionList.SessionListResultSchema,
      handlerLocation: 'background',
      broadcastOnly: false,
    },
    {
      key: 'SESSION_GET',
      requestSchema: sessionList.SessionGetRequestSchema,
      responseSchema: sessionList.SessionGetResultSchema,
      handlerLocation: 'background',
      broadcastOnly: false,
    },
    // Session bindings
    {
      key: 'SESSION_BINDING_PUT',
      requestSchema: sessionBinding.SessionBindingPutRequestSchema,
      responseSchema: sessionBinding.SessionBindingPutResponseSchema,
      handlerLocation: 'background',
      broadcastOnly: false,
    },
    {
      key: 'SESSION_BINDING_GET',
      requestSchema: sessionBinding.SessionBindingGetRequestSchema,
      responseSchema: sessionBinding.SessionBindingGetResponseSchema,
      handlerLocation: 'background',
      broadcastOnly: false,
    },
    // Generic Intent
    {
      key: 'GENERIC_INTENT_DETECT',
      requestSchema: genericIntent.GenericIntentDetectRequestSchema,
      responseSchema: genericIntent.GenericIntentDetectResponseSchema,
      handlerLocation: 'background',
      broadcastOnly: false,
    },
  ];

  return {
    pairs,
    meta: defineDuMod.DISCRIMINATED_META,
  };
}

function toJsonSchema(
  schema: z.ZodTypeAny,
  meta: ReadonlyMap<string, DiscriminatedMeta>,
): JSONSchema7 {
  const raw = zodToJsonSchema(schema, {
    target: 'jsonSchema7',
    $refStrategy: 'none',
  }) as JSONSchema7;
  return rewriteDiscriminatedUnions(raw, meta);
}

interface ProtocolDocument {
  readonly $schema: string;
  readonly version: string;
  readonly generatedAt: string;
  readonly keys: ReadonlyArray<{
    readonly key: string;
    readonly handlerLocation: string;
    readonly broadcastOnly: boolean;
    readonly request: JSONSchema7 | null;
    readonly response: JSONSchema7 | null;
  }>;
}

function buildDocument(
  pairs: readonly SchemaPair[],
  meta: ReadonlyMap<string, DiscriminatedMeta>,
): ProtocolDocument {
  return {
    $schema: 'http://json-schema.org/draft-07/schema#',
    version: '1.0.0',
    generatedAt: '1970-01-01T00:00:00.000Z', // deterministic for --check
    keys: pairs.map((p) => ({
      key: p.key,
      handlerLocation: p.handlerLocation,
      broadcastOnly: p.broadcastOnly,
      request: p.requestSchema != null ? toJsonSchema(p.requestSchema, meta) : null,
      response: p.responseSchema != null ? toJsonSchema(p.responseSchema, meta) : null,
    })),
  };
}

function buildMarkdown(doc: ProtocolDocument): string {
  const lines: string[] = [];
  lines.push('# Extension Protocol Catalog');
  lines.push('');
  lines.push(
    '**Generated file.** Edit source schemas at `src/background/messaging/schemas/**` and run `pnpm generate:protocol-schema`.',
  );
  lines.push('');
  lines.push(`Schema version: ${doc.version}`);
  lines.push(`Total keys: ${doc.keys.length}`);
  lines.push('');
  lines.push('## Key Table');
  lines.push('');
  lines.push('| Key | Handler | Broadcast-Only |');
  lines.push('|---|---|---|');
  for (const k of doc.keys) {
    lines.push(
      `| \`${k.key}\` | ${k.handlerLocation} | ${k.broadcastOnly ? 'yes' : 'no'} |`,
    );
  }
  lines.push('');
  lines.push('## Request / Response Shapes');
  lines.push('');
  for (const k of doc.keys) {
    lines.push(`### ${k.key}`);
    lines.push('');
    lines.push(`Handler: ${k.handlerLocation}. Broadcast-only: ${k.broadcastOnly}.`);
    lines.push('');
    lines.push('Request schema:');
    lines.push('```json');
    lines.push(JSON.stringify(k.request, null, 2));
    lines.push('```');
    lines.push('');
    lines.push('Response schema:');
    lines.push('```json');
    lines.push(JSON.stringify(k.response, null, 2));
    lines.push('```');
    lines.push('');
  }
  return lines.join('\n') + '\n';
}

function readOptional(path: string): string | null {
  try {
    return readFileSync(path, 'utf-8');
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  if (!existsSync(DOCS_DIR)) mkdirSync(DOCS_DIR, { recursive: true });
  const { pairs, meta } = await loadModules();
  const doc = buildDocument(pairs, meta);
  const jsonOut = JSON.stringify(doc, null, 2) + '\n';
  const mdOut = buildMarkdown(doc);

  if (CHECK_MODE) {
    const existingJson = readOptional(OUT_JSON);
    const existingMd = readOptional(OUT_MD);
    let ok = true;
    if (existingJson !== jsonOut) {
      process.stderr.write(`drift: ${OUT_JSON}\n`);
      ok = false;
    }
    if (existingMd !== mdOut) {
      process.stderr.write(`drift: ${OUT_MD}\n`);
      ok = false;
    }
    if (!ok) {
      process.stderr.write(
        'protocol schema has drifted. Run `pnpm generate:protocol-schema` to regenerate.\n',
      );
      process.exit(1);
    }
    process.stdout.write(`protocol schema up to date (${pairs.length} keys)\n`);
    process.exit(0);
  }

  writeFileSync(OUT_JSON, jsonOut, 'utf-8');
  writeFileSync(OUT_MD, mdOut, 'utf-8');
  process.stdout.write(
    `wrote ${OUT_JSON} (${pairs.length} keys) and ${OUT_MD}\n`,
  );
  process.exit(0);
}

main().catch((err: unknown) => {
  process.stderr.write(`generate-protocol-schema error: ${String(err)}\n`);
  if (err instanceof Error && err.stack) {
    process.stderr.write(err.stack + '\n');
  }
  process.exit(2);
});
