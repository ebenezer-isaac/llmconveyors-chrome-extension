/**
 * Template for `src/ats/<vendor>/blueprint.ts` (if extension consumes an
 * in-repo adapter directly) or `src/ats/<vendor>.consumption.blueprint.ts`
 * (if consuming from `ats-autofill-engine/<vendor>`).
 *
 * B7 / B8 / B9 in the engine repo fill the authoritative blueprint. The
 * extension-side consumption blueprint tracks how the extension uses the
 * adapter (which methods are invoked, which fixtures validated against).
 */

import type { ModuleBlueprint } from './blueprint.types';

// A8 REFERENCES: the extension side consumes ats-autofill-engine/<vendor> adapters
// via dynamic import in src/content/autofill. This template documents the
// expected shape so the validator can reject silent divergence.
export const blueprint: ModuleBlueprint = {
  moduleId: 'ats/<vendor>',
  label: 'ATS Adapter (<vendor>) consumption contract',
  description:
    'Tracks the subset of AtsAdapter methods the extension actually invokes ' +
    '(matchesUrl, scanForm, fillField, attachFile). Every adapter is consumed ' +
    'through its own ats-autofill-engine sub-entry; cross-adapter imports are ' +
    'forbidden even transitively.',
  category: 'ats-adapter',
  publicExports: ['adapter'],
  forbiddenImports: [
    'src/ats/<other-vendor>/**',
    'src/background/**',
    'ats-autofill-engine/dist/**',
  ],
  messageHandlers: [],
  invariants: [
    // A8 REFERENCES: adapter.kind is a literal string matching the folder name;
    //   adapter is Object.freeze'd (mutation attempts throw in strict mode);
    //   adapter.matchesUrl is a pure function of URL (no side effects);
    //   adapter.fillField returns a discriminated union { ok: true } | { ok: false }.
  ],
  knownIssues: [],
};
