// SPDX-License-Identifier: MIT
/**
 * Barrel for every Zod schema the extension ships. The schema generator reads
 * this file (plus each schema module) to produce docs/protocol.schema.json.
 *
 * Post 101.2: the profile.schema / profile-messages.schema modules are gone
 * -- the canonical user resume lives in the backend master-resume API.
 */

export * from './define-discriminated-union';
export * from './auth.schema';
export * from './intent.schema';
export * from './fill.schema';
export * from './keywords.schema';
export * from './highlight.schema';
export * from './generation.schema';
export * from './credits.schema';
export * from './profile.schema';
export * from './session-list.schema';
export * from './generic-intent.schema';
