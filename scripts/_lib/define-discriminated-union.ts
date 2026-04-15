// SPDX-License-Identifier: MIT
/**
 * Standalone copy of the discriminated-union post-processor helper used by
 * the schema generator. Kept under scripts/_lib so the generator does not
 * import runtime handler code (avoids wxt/browser resolution at build time).
 */

import type { JSONSchema7 } from 'json-schema';

export interface DiscriminatedMeta {
  readonly name: string;
  readonly discriminator: string;
}

type LLMCAnnotated = JSONSchema7 & { readonly title?: string; readonly description?: string };

/**
 * Walk a JSON Schema tree. Wherever a node has `anyOf` AND its description
 * matches a registered discriminated-union name, rewrite `anyOf` to `oneOf`
 * and attach a discriminator.
 */
export function rewriteDiscriminatedUnions(
  schema: JSONSchema7,
  meta: ReadonlyMap<string, DiscriminatedMeta>,
): JSONSchema7 {
  if (typeof schema !== 'object' || schema === null) return schema;
  const out: LLMCAnnotated = { ...schema };
  const identifier =
    (typeof out.description === 'string' && meta.has(out.description)
      ? out.description
      : null) ??
    (typeof out.title === 'string' && meta.has(out.title) ? out.title : null);
  if (out.anyOf && identifier !== null) {
    const entry = meta.get(identifier);
    if (entry) {
      (out as unknown as { oneOf: unknown[] }).oneOf = out.anyOf;
      delete (out as { anyOf?: unknown }).anyOf;
      (out as unknown as Record<string, unknown>).discriminator = {
        propertyName: entry.discriminator,
      };
    }
  }
  if (out.properties) {
    const props: Record<string, JSONSchema7> = {};
    for (const [k, v] of Object.entries(out.properties)) {
      props[k] = rewriteDiscriminatedUnions(v as JSONSchema7, meta);
    }
    out.properties = props;
  }
  if (Array.isArray(out.items)) {
    out.items = out.items.map(
      (i) => rewriteDiscriminatedUnions(i as JSONSchema7, meta),
    ) as JSONSchema7[];
  } else if (out.items) {
    out.items = rewriteDiscriminatedUnions(out.items as JSONSchema7, meta);
  }
  if (Array.isArray(out.anyOf)) {
    out.anyOf = out.anyOf.map(
      (i) => rewriteDiscriminatedUnions(i as JSONSchema7, meta),
    ) as JSONSchema7[];
  }
  if (Array.isArray(out.oneOf)) {
    out.oneOf = out.oneOf.map(
      (i) => rewriteDiscriminatedUnions(i as JSONSchema7, meta),
    ) as JSONSchema7[];
  }
  if (Array.isArray(out.allOf)) {
    out.allOf = out.allOf.map(
      (i) => rewriteDiscriminatedUnions(i as JSONSchema7, meta),
    ) as JSONSchema7[];
  }
  return out;
}
