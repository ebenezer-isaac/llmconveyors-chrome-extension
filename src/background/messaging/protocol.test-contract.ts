// SPDX-License-Identifier: MIT
/**
 * Compile-time assertion that ProtocolMap ships EXACTLY the 19 keys required
 * by the keystone contract. This file has no runtime effect; its purpose is
 * to fail `tsc --noEmit` if a key is missing or an extra one is added.
 */

import type { ProtocolMap } from './protocol';

type RequiredKeys =
  | 'AUTH_SIGN_IN'
  | 'AUTH_SIGN_OUT'
  | 'AUTH_STATUS'
  | 'AUTH_STATE_CHANGED'
  | 'PROFILE_GET'
  | 'PROFILE_UPDATE'
  | 'PROFILE_UPLOAD_JSON_RESUME'
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
  | 'DETECTED_JOB_BROADCAST'
  | 'CREDITS_GET';

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
