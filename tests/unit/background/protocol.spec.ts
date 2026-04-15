// SPDX-License-Identifier: MIT
import { describe, it, expect } from 'vitest';
import {
  BG_HANDLED_KEYS,
  ALL_PROTOCOL_KEYS,
} from '../../../src/background/messaging/protocol';

describe('ProtocolMap key registry', () => {
  it('BG_HANDLED_KEYS has exactly 17 entries', () => {
    expect(BG_HANDLED_KEYS).toHaveLength(17);
  });

  it('ALL_PROTOCOL_KEYS has exactly 19 entries', () => {
    expect(ALL_PROTOCOL_KEYS).toHaveLength(19);
  });

  it('ALL_PROTOCOL_KEYS is a superset of BG_HANDLED_KEYS', () => {
    const bgSet = new Set(BG_HANDLED_KEYS as readonly string[]);
    for (const key of bgSet) {
      expect(ALL_PROTOCOL_KEYS).toContain(key);
    }
  });

  it('ALL_PROTOCOL_KEYS contains the required 19 keys', () => {
    const required = [
      'AUTH_SIGN_IN',
      'AUTH_SIGN_OUT',
      'AUTH_STATUS',
      'AUTH_STATE_CHANGED',
      'PROFILE_GET',
      'PROFILE_UPDATE',
      'PROFILE_UPLOAD_JSON_RESUME',
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
});
