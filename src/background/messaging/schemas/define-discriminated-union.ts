// SPDX-License-Identifier: MIT
/**
 * Helper for registering Zod discriminated unions with a named discriminator.
 *
 * `zod-to-json-schema` v3.24 emits `anyOf` for `z.discriminatedUnion` and does
 * not attach the discriminator. The schema generator post-processes the output:
 * it looks up the name in DISCRIMINATED_META and rewrites `anyOf` to `oneOf`
 * plus `discriminator: { propertyName }`.
 *
 * This helper is the only registration surface. Every discriminated union in
 * `src/background/messaging/schemas/**` goes through here.
 */

import type { z } from 'zod';

export interface DiscriminatedMeta {
  readonly name: string;
  readonly discriminator: string;
}

export const DISCRIMINATED_META = new Map<string, DiscriminatedMeta>();

type ZDU = z.ZodDiscriminatedUnion<string, z.ZodDiscriminatedUnionOption<string>[]>;

export function defineDiscriminatedUnion<T extends ZDU>(name: string, schema: T): T {
  const firstOption = schema.options[0];
  if (!firstOption) {
    throw new Error(`defineDiscriminatedUnion(${name}): schema has no options`);
  }
  const shape = (firstOption as unknown as { shape: Record<string, unknown> }).shape;
  const keys = Object.keys(shape);
  const discriminator = keys[0];
  if (!discriminator) {
    throw new Error(`defineDiscriminatedUnion(${name}): first option has no keys`);
  }
  DISCRIMINATED_META.set(name, { name, discriminator });
  // Attach name metadata so the post-processor can identify it by schema
  // description. Zod does not expose a public metadata store for 3.x, so we
  // tag via .describe which is public.
  (schema as unknown as { _llmcName?: string })._llmcName = name;
  return schema.describe(name) as T;
}

/** Clear registration (test-only). */
export function __resetDiscriminatedMeta(): void {
  DISCRIMINATED_META.clear();
}
