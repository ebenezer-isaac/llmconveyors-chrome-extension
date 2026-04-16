// SPDX-License-Identifier: MIT
/**
 * Compile-time assertion that ProtocolMap ships EXACTLY the keys required by
 * the post-101 keystone contract. This file has no runtime effect; its
 * purpose is to fail `tsc --noEmit` if a key is missing or an extra one is
 * added.
 *
 * The PROFILE_* family was removed in 101.2 when the local profile stack
 * was replaced by the backend-owned master-resume.
 */

import type { ProtocolMap } from './protocol';

type RequiredKeys =
  | 'AUTH_SIGN_IN'
  | 'AUTH_SIGN_OUT'
  | 'AUTH_STATUS'
  | 'AUTH_STATE_CHANGED'
  | 'AUTH_COOKIE_EXCHANGE'
  | 'KEYWORDS_EXTRACT'
  | 'INTENT_DETECTED'
  | 'INTENT_GET'
  | 'FILL_REQUEST'
  | 'HIGHLIGHT_APPLY'
  | 'HIGHLIGHT_CLEAR'
  | 'HIGHLIGHT_STATUS'
  | 'GENERATION_START'
  | 'GENERATION_UPDATE'
  | 'GENERATION_CANCEL'
  | 'GENERATION_SUBSCRIBE'
  | 'GENERATION_INTERACT'
  | 'GENERATION_STARTED'
  | 'GENERATION_COMPLETE'
  | 'DETECTED_JOB_BROADCAST'
  | 'CREDITS_GET'
  | 'PROFILE_GET'
  | 'MASTER_RESUME_GET'
  | 'MASTER_RESUME_PUT'
  | 'AGENT_PREFERENCE_GET'
  | 'AGENT_PREFERENCE_SET'
  | 'AGENT_REGISTRY_LIST'
  | 'AGENT_MANIFEST_GET'
  | 'SESSION_LIST'
  | 'SESSION_GET'
  | 'SESSION_HYDRATE_GET'
  | 'SESSION_BINDING_PUT'
  | 'SESSION_BINDING_GET'
  | 'GENERIC_INTENT_DETECT';

type RequiredPresent = RequiredKeys extends keyof ProtocolMap ? true : false;
type NoExtras = Exclude<keyof ProtocolMap, RequiredKeys> extends never ? true : false;

const REQUIRED_PRESENT: RequiredPresent = true;
const NO_EXTRAS: NoExtras = true;

export const PROTOCOL_CONTRACT_CHECK: {
  readonly requiredPresent: RequiredPresent;
  readonly noExtras: NoExtras;
} = Object.freeze({
  requiredPresent: REQUIRED_PRESENT,
  noExtras: NO_EXTRAS,
});
