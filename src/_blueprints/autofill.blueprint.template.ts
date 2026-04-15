/**
 * Template for `src/content/autofill/blueprint.ts`.
 *
 * A8 copies this file to its destination and fills the invariants + sourceRefs
 * from the real controller implementation. The autofill lifecycle is
 * scan -> classify -> plan -> fill, executed once per `FILL_REQUEST`.
 */

import type { ModuleBlueprint } from './blueprint.types';

// A8 FILLS: populate invariants + sourceRefs once autofill controller is written.
export const blueprint: ModuleBlueprint = {
  moduleId: 'content/autofill',
  label: 'Content-Script Autofill Controller',
  description:
    'Owns scan -> classify -> plan -> fill lifecycle. Dynamically imports the ' +
    'correct ats-autofill-engine adapter at runtime via adapter.matchesUrl. ' +
    'Uses a Deps object (D20) so scan / profile / file / broadcast / logger / ' +
    'now / document are injectable for tests.',
  category: 'autofill',
  publicExports: ['createAutofillController', 'AutofillControllerDeps'],
  forbiddenImports: [
    'src/background/**',
    'entrypoints/background.ts',
    'ats-autofill-engine/dist/**',
  ],
  messageHandlers: [],
  invariants: [
    // A8 REFERENCES: add invariants e.g. "scan called exactly once per FILL_REQUEST",
    //   "fill results aggregate ok/failed/skipped and match FillRequestResponse shape",
    //   "re-entry during in-flight fill rejects with reason: 'wizard-not-ready'".
  ],
  knownIssues: [],
};
