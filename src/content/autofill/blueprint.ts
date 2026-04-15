// SPDX-License-Identifier: MIT
/**
 * Blueprint for the A8 content-script autofill module.
 *
 * Owns the scan -> classify -> plan -> fill lifecycle, executed on
 * every FILL_REQUEST. Dynamically imports the correct
 * ats-autofill-engine adapter per host and orchestrates the Workday
 * multi-step wizard loop.
 */

import type { ModuleBlueprint } from '../../_blueprints/blueprint.types';

export const blueprint: ModuleBlueprint = {
  moduleId: 'content/autofill',
  label: 'Content-Script Autofill Controller',
  description:
    'Owns scan -> classify -> plan -> fill lifecycle. Dynamically ' +
    'imports the correct ats-autofill-engine adapter at runtime via ' +
    'suffix host matching. Uses a Deps object (D20) so adapter ' +
    'loading, profile reads, file resolution, broadcasts, logger, ' +
    'now, and document are injectable for tests. Owns Workday wizard ' +
    'step watcher lifecycle (D6).',
  category: 'autofill',
  publicExports: [
    'AutofillController',
    'createProductionDeps',
    'resolveAtsKind',
    'loadAdapter',
    'productionDynamicImport',
    'readProfile',
    'isEmptyProfile',
    'registerFillListener',
    'blueprint',
  ],
  forbiddenImports: [
    'entrypoints/popup/**',
    'entrypoints/options/**',
    'entrypoints/sidepanel/**',
  ],
  messageHandlers: [],
  invariants: [
    {
      id: 'AUTOFILL-001',
      description:
        'Controller NEVER throws out of executeFill; every failure ' +
        'path returns a typed FillRequestResponse with aborted=true ' +
        'and a canonical abortReason.',
      severity: 'error',
      check: {
        type: 'custom',
        description: 'autofill-controller.ts executeFill + unit tests',
      },
      sourceRef: { file: 'autofill-controller.ts', line: 1 },
    },
    {
      id: 'AUTOFILL-002',
      description:
        'Adapter is loaded exactly once per URL per controller ' +
        'lifetime via single-flight promise. Concurrent executeFill ' +
        'calls share the loadingPromise.',
      severity: 'error',
      check: {
        type: 'custom',
        description:
          'autofill-controller.ts ensureAdapter + re-entry tests',
      },
      sourceRef: { file: 'autofill-controller.ts', line: 1 },
    },
    {
      id: 'AUTOFILL-003',
      description:
        'Host matching is suffix-based. Substring matching is ' +
        'rejected because it is a homograph / phishing vector.',
      severity: 'error',
      check: {
        type: 'custom',
        description:
          'adapter-loader.ts resolveAtsKind + security unit tests',
      },
      sourceRef: { file: 'adapter-loader.ts', line: 1 },
    },
    {
      id: 'AUTOFILL-004',
      description:
        'Profile reader uses ProfileSchema.safeParse from ' +
        'ats-autofill-engine/profile. v1 legacy top-level shapes are ' +
        'rejected so stale storage cannot poison the pipeline.',
      severity: 'error',
      check: {
        type: 'custom',
        description: 'profile-reader.ts readProfile + unit tests',
      },
      sourceRef: { file: 'profile-reader.ts', line: 1 },
    },
    {
      id: 'AUTOFILL-005',
      description:
        'Workday wizard orchestration: controller mounts ' +
        'watchForStepChange on boot, holds currentStep in closure, ' +
        're-runs scanStep + fillStep on each FILL_REQUEST per D6.',
      severity: 'error',
      check: {
        type: 'custom',
        description:
          'autofill-controller.ts executeWorkdayFill + wizard tests',
      },
      sourceRef: { file: 'autofill-controller.ts', line: 1 },
    },
  ],
  knownIssues: [],
};

export const AUTOFILL_MODULE_BLUEPRINT = blueprint;
