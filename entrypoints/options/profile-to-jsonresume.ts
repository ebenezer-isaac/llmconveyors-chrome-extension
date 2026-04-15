// SPDX-License-Identifier: MIT
/**
 * Thin re-export for the options page: the conversion itself lives in the
 * profile module. Keeping a re-export here lets component code import from a
 * local path without reaching into `src/background/profile/`.
 */
export {
  profileToJsonResume,
  type JsonResumeExport,
} from '@/src/background/profile/json-resume-converter';
