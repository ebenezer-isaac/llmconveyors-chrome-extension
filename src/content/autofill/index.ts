// SPDX-License-Identifier: MIT
/**
 * Barrel export for the content-script autofill module.
 */

export { AutofillController } from './autofill-controller';
export type {
  AutofillControllerDeps,
  FillAbortReason,
} from './autofill-controller';
export { createProductionDeps } from './deps-factory';
export {
  resolveAtsKind,
  loadAdapter,
  productionDynamicImport,
} from './adapter-loader';
export type { AdapterLoaderDeps } from './adapter-loader';
export {
  readProfile,
  isEmptyProfile,
  PROFILE_STORAGE_KEY,
} from './profile-reader';
export type { ProfileReaderDeps } from './profile-reader';
export { registerFillListener } from './messaging';
export { blueprint, AUTOFILL_MODULE_BLUEPRINT } from './blueprint';
