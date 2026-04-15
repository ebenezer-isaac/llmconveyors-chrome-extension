// SPDX-License-Identifier: MIT
/**
 * Barrel for the backend master-resume module. The autofill pipeline, popup,
 * side panel, and options surface import from here.
 */

export {
  MasterResumeResponseSchema,
  MasterResumeUpsertSchema,
  ApiEnvelopeSchema,
  type MasterResumeResponse,
  type MasterResumeUpsert,
} from './master-resume-schema';
export {
  createMasterResumeClient,
  type MasterResumeClientDeps,
  type MasterResumeGetOutcome,
  type MasterResumePutOutcome,
} from './master-resume-client';
export {
  createMasterResumeCache,
  MASTER_RESUME_CACHE_KEY,
  type MasterResumeCacheEntry,
  type MasterResumeCacheDeps,
  type ChromeStorageLocal,
} from './master-resume-cache';
export {
  createMasterResumeHandlers,
  type MasterResumeHandlerDeps,
  type MasterResumeGetRequest,
  type MasterResumeGetResponse,
  type MasterResumePutRequest,
  type MasterResumePutResponse,
} from './master-resume-handlers';
