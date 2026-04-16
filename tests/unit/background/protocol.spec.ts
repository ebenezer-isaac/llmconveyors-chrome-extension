// SPDX-License-Identifier: MIT
import { describe, it, expect } from 'vitest';
import {
  BG_HANDLED_KEYS,
  ALL_PROTOCOL_KEYS,
} from '../../../src/background/messaging/protocol';

/**
 * ProtocolMap key registry. The legacy local-profile storage was removed in
 * 101.2 in favor of the backend-owned master-resume, so the PROFILE_UPDATE /
 * PROFILE_UPLOAD_JSON_RESUME writer keys stay absent. A separate PROFILE_GET
 * was reintroduced later to surface the backend's identity fields (email,
 * displayName, photoURL) to the popup avatar.
 */
describe('ProtocolMap key registry', () => {
  it('BG_HANDLED_KEYS has exactly 36 entries', () => {
    // +2 from 34: HIGHLIGHT_APPLY / HIGHLIGHT_CLEAR moved in as bg
    // forwarders (see handlers.ts) so the popup's runtime.sendMessage
    // reaches the content script. Previously they were content-script
    // only and the popup got "no response".
    expect(BG_HANDLED_KEYS).toHaveLength(36);
  });

  it('ALL_PROTOCOL_KEYS has exactly 36 entries', () => {
    expect(ALL_PROTOCOL_KEYS).toHaveLength(36);
  });

  it('ALL_PROTOCOL_KEYS is a superset of BG_HANDLED_KEYS', () => {
    const bgSet = new Set(BG_HANDLED_KEYS as readonly string[]);
    for (const key of bgSet) {
      expect(ALL_PROTOCOL_KEYS).toContain(key);
    }
  });

  it('ALL_PROTOCOL_KEYS contains the required set of keys', () => {
    const required = [
      'AUTH_SIGN_IN',
      'AUTH_SIGN_OUT',
      'AUTH_STATUS',
      'AUTH_STATE_CHANGED',
      'KEYWORDS_EXTRACT',
      'INTENT_DETECTED',
      'INTENT_GET',
      'FILL_REQUEST',
      'HIGHLIGHT_APPLY',
      'HIGHLIGHT_CLEAR',
      'HIGHLIGHT_STATUS',
      'GENERATION_START',
      'GENERATION_UPDATE',
      'GENERATION_CANCEL',
      'GENERATION_SUBSCRIBE',
      'GENERATION_INTERACT',
      'GENERATION_STARTED',
      'GENERATION_COMPLETE',
      'DETECTED_JOB_BROADCAST',
      'CREDITS_GET',
      'PROFILE_GET',
      'MASTER_RESUME_GET',
      'MASTER_RESUME_PUT',
      'AGENT_PREFERENCE_GET',
      'AGENT_PREFERENCE_SET',
      'AGENT_REGISTRY_LIST',
      'AGENT_MANIFEST_GET',
      'SESSION_LIST',
      'SESSION_GET',
      'SESSION_HYDRATE_GET',
      'SESSION_BINDING_PUT',
      'SESSION_BINDING_GET',
      'SESSION_SELECTED',
      'ARTIFACT_FETCH_BLOB',
      'GENERIC_INTENT_DETECT',
      'AUTH_COOKIE_EXCHANGE',
    ].sort();
    const actual = [...ALL_PROTOCOL_KEYS].sort();
    expect(actual).toEqual(required);
  });

  it('HIGHLIGHT_APPLY and HIGHLIGHT_CLEAR are in BG_HANDLED_KEYS (forwarders)', () => {
    const bgSet = new Set(BG_HANDLED_KEYS as readonly string[]);
    expect(bgSet.has('HIGHLIGHT_APPLY')).toBe(true);
    expect(bgSet.has('HIGHLIGHT_CLEAR')).toBe(true);
  });

  it('the deprecated PROFILE writer keys stay removed (master-resume owns writes)', () => {
    const allSet = new Set(ALL_PROTOCOL_KEYS as readonly string[]);
    expect(allSet.has('PROFILE_UPDATE')).toBe(false);
    expect(allSet.has('PROFILE_UPLOAD_JSON_RESUME')).toBe(false);
  });
});
