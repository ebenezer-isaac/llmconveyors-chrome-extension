// SPDX-License-Identifier: MIT
/**
 * Barrel for every Zod schema the extension ships. The schema generator reads
 * this file (plus each schema module) to produce docs/protocol.schema.json.
 */

export * from './define-discriminated-union';
export * from './profile.schema';
export * from './auth.schema';
export * from './profile-messages.schema';
export * from './intent.schema';
export * from './fill.schema';
export * from './keywords.schema';
export * from './highlight.schema';
export * from './generation.schema';
export * from './credits.schema';
