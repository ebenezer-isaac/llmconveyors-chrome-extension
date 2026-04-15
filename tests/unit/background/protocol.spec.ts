// SPDX-License-Identifier: MIT
import { describe, it, expect } from 'vitest';
import {
  BG_HANDLED_KEYS,
  ALL_PROTOCOL_KEYS,
} from '../../../src/background/messaging/protocol';

/**
 * Post-101 key registry. The PROFILE_* family was removed when the local
 * profile storage was replaced by the backend-owned master-resume, so
 * BG_HANDLED_KEYS has 14 entries and ALL_PROTOCOL_KEYS has 16.
 */
describe('ProtocolMap key registry', () => {
  it('BG_HANDLED_KEYS has exactly 14 entries (post-101, no PROFILE_*)', () => {
    expect(BG_HANDLED_KEYS).toHaveLength(14);
  });

  it('ALL_PROTOCOL_KEYS has exactly 16 entries (post-101, no PROFILE_*)', () => {
    expect(ALL_PROTOCOL_KEYS).toHaveLength(16);
  });

  it('ALL_PROTOCOL_KEYS is a superset of BG_HANDLED_KEYS', () => {
    const bgSet = new Set(BG_HANDLED_KEYS as readonly string[]);
    for (const key of bgSet) {
      expect(ALL_PROTOCOL_KEYS).toContain(key);
    }
  });

  it('ALL_PROTOCOL_KEYS contains the required 16 post-101 keys', () => {
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
      'DETECTED_JOB_BROADCAST',
      'CREDITS_GET',
    ].sort();
    const actual = [...ALL_PROTOCOL_KEYS].sort();
    expect(actual).toEqual(required);
  });

  it('HIGHLIGHT_APPLY and HIGHLIGHT_CLEAR are NOT in BG_HANDLED_KEYS', () => {
    const bgSet = new Set(BG_HANDLED_KEYS as readonly string[]);
    expect(bgSet.has('HIGHLIGHT_APPLY')).toBe(false);
    expect(bgSet.has('HIGHLIGHT_CLEAR')).toBe(false);
  });

  it('PROFILE_* keys are NOT in ALL_PROTOCOL_KEYS (replaced by master-resume)', () => {
    const allSet = new Set(ALL_PROTOCOL_KEYS as readonly string[]);
    expect(allSet.has('PROFILE_GET')).toBe(false);
    expect(allSet.has('PROFILE_UPDATE')).toBe(false);
    expect(allSet.has('PROFILE_UPLOAD_JSON_RESUME')).toBe(false);
  });
});
