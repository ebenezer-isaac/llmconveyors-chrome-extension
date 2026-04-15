// SPDX-License-Identifier: MIT
/**
 * ProtocolMap - the single owner of every cross-context message in the
 * extension (D2).
 *
 * Post 101.2: the PROFILE_* keys were removed when the local profile
 * storage was scrapped in favor of the backend-owned master-resume.
 */

import { defineExtensionMessaging } from '@webext-core/messaging';
import type {
  AuthSignInRequest,
  AuthSignOutRequest,
  AuthStatusRequest,
  AuthSignInResponse,
  AuthSignOutResponse,
  AuthState,
  DetectedIntentPayload,
  IntentGetRequest,
  IntentGetResponse,
  DetectedJobBroadcast,
  FillRequest,
  FillRequestResponse,
  KeywordsExtractRequest,
  KeywordsExtractResponse,
  HighlightApplyRequest,
  HighlightApplyResponse,
  HighlightClearRequest,
  HighlightClearResponse,
  HighlightStatusRequest,
  HighlightStatus,
  GenerationStartRequest,
  GenerationStartResponse,
  GenerationUpdateBroadcast,
  GenerationCancelRequest,
  GenerationCancelResponse,
  CreditsGetRequest,
  CreditsState,
} from './protocol-types';

export interface ProtocolMap {
  // --- Auth (4) ---
  AUTH_SIGN_IN: (data: AuthSignInRequest) => AuthSignInResponse;
  AUTH_SIGN_OUT: (data: AuthSignOutRequest) => AuthSignOutResponse;
  AUTH_STATUS: (data: AuthStatusRequest) => AuthState;
  AUTH_STATE_CHANGED: (data: AuthState) => void;

  // --- Intent (2) ---
  INTENT_DETECTED: (data: DetectedIntentPayload) => void;
  INTENT_GET: (data: IntentGetRequest) => IntentGetResponse;

  // --- Fill (1) ---
  FILL_REQUEST: (data: FillRequest) => FillRequestResponse;

  // --- Keywords (1) ---
  KEYWORDS_EXTRACT: (data: KeywordsExtractRequest) => KeywordsExtractResponse;

  // --- Highlight (3) --- APPLY/CLEAR are registered by the content script
  HIGHLIGHT_APPLY: (data: HighlightApplyRequest) => HighlightApplyResponse;
  HIGHLIGHT_CLEAR: (data: HighlightClearRequest) => HighlightClearResponse;
  HIGHLIGHT_STATUS: (data: HighlightStatusRequest) => HighlightStatus;

  // --- Generation (3) ---
  GENERATION_START: (data: GenerationStartRequest) => GenerationStartResponse;
  GENERATION_UPDATE: (data: GenerationUpdateBroadcast) => void;
  GENERATION_CANCEL: (data: GenerationCancelRequest) => GenerationCancelResponse;

  // --- Broadcast (1) ---
  DETECTED_JOB_BROADCAST: (data: DetectedJobBroadcast) => void;

  // --- Credits (1) ---
  CREDITS_GET: (data: CreditsGetRequest) => CreditsState;
}

/**
 * The keys the background worker registers handlers for. HIGHLIGHT_APPLY
 * and HIGHLIGHT_CLEAR are registered by the content script (A9); the bg
 * never receives them directly.
 */
export const BG_HANDLED_KEYS = [
  'AUTH_SIGN_IN',
  'AUTH_SIGN_OUT',
  'AUTH_STATUS',
  'AUTH_STATE_CHANGED',
  'INTENT_DETECTED',
  'INTENT_GET',
  'FILL_REQUEST',
  'KEYWORDS_EXTRACT',
  'HIGHLIGHT_STATUS',
  'GENERATION_START',
  'GENERATION_UPDATE',
  'GENERATION_CANCEL',
  'DETECTED_JOB_BROADCAST',
  'CREDITS_GET',
] as const;

export type BgHandledKey = (typeof BG_HANDLED_KEYS)[number];

/**
 * All ProtocolMap keys enumerated at runtime. Used by the schema
 * generator and validators.
 */
export const ALL_PROTOCOL_KEYS = [
  ...BG_HANDLED_KEYS,
  'HIGHLIGHT_APPLY',
  'HIGHLIGHT_CLEAR',
] as const;

export type ProtocolKey = (typeof ALL_PROTOCOL_KEYS)[number];

/** Shared sendMessage / onMessage bound to ProtocolMap. */
export const { sendMessage, onMessage } = defineExtensionMessaging<ProtocolMap>();

// Re-export value types for ergonomic consumer imports.
export type {
  AuthState,
  AuthSignInResponse,
  AuthSignOutResponse,
  StoredSession,
  DetectedIntent,
  DetectedIntentPayload,
  FillRequestResponse,
  KeywordsExtractRequest,
  KeywordsExtractResponse,
  HighlightApplyResponse,
  HighlightClearResponse,
  HighlightStatus,
  GenerationStartRequest,
  GenerationStartResponse,
  GenerationUpdateBroadcast,
  CreditsState,
} from './protocol-types';
export type { GenerationArtifact } from './schemas/generation.schema';
