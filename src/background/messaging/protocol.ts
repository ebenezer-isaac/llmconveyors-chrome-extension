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
  AuthCookieExchangeRequest,
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
  GenerationSubscribeRequest,
  GenerationSubscribeResponse,
  GenerationInteractRequest,
  GenerationInteractResponse,
  CreditsGetRequest,
  ClientCreditsSnapshot,
  ProfileGetRequest,
  ClientProfileSnapshot,
  SessionListRequest,
  SessionListResult,
  SessionGetRequest,
  SessionGetResult,
  SessionHydrateGetRequest,
  SessionHydrateGetResponse,
  GenericIntentDetectRequest,
  GenericIntentDetectResponse,
  SessionBindingPutRequest,
  SessionBindingPutResponse,
  SessionBindingGetRequest,
  SessionBindingGetResponse,
} from './protocol-types';
import type {
  MasterResumeGetRequest,
  MasterResumeGetResponse,
  MasterResumePutRequest,
  MasterResumePutResponse,
} from '../master-resume';
import type {
  AgentPreferenceGetRequest,
  AgentPreferenceGetResponse,
  AgentPreferenceSetRequest,
  AgentPreferenceSetResponse,
  AgentRegistryListRequest,
  AgentRegistryListResponse,
  AgentManifestGetRequest,
  AgentManifestGetResponse,
} from '../agents';

export interface ProtocolMap {
  // --- Auth (5) ---
  AUTH_SIGN_IN: (data: AuthSignInRequest) => AuthSignInResponse;
  AUTH_SIGN_OUT: (data: AuthSignOutRequest) => AuthSignOutResponse;
  AUTH_STATUS: (data: AuthStatusRequest) => AuthState;
  AUTH_STATE_CHANGED: (data: AuthState) => void;
  AUTH_COOKIE_EXCHANGE: (data: AuthCookieExchangeRequest) => AuthState;

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

  // --- Generation (7) ---
  GENERATION_START: (data: GenerationStartRequest) => GenerationStartResponse;
  GENERATION_UPDATE: (data: GenerationUpdateBroadcast) => void;
  GENERATION_CANCEL: (data: GenerationCancelRequest) => GenerationCancelResponse;
  GENERATION_SUBSCRIBE: (data: GenerationSubscribeRequest) => GenerationSubscribeResponse;
  GENERATION_INTERACT: (data: GenerationInteractRequest) => GenerationInteractResponse;
  GENERATION_STARTED: (data: { readonly generationId: string; readonly sessionId: string; readonly agentType: 'job-hunter' | 'b2b-sales' }) => void;
  GENERATION_COMPLETE: (data: { readonly generationId: string; readonly sessionId: string }) => void;

  // --- Broadcast (1) ---
  DETECTED_JOB_BROADCAST: (data: DetectedJobBroadcast) => void;

  // --- Credits (1) ---
  CREDITS_GET: (data: CreditsGetRequest) => ClientCreditsSnapshot;

  // --- Profile (1) ---
  PROFILE_GET: (data: ProfileGetRequest) => ClientProfileSnapshot;

  // --- Master Resume (2) ---
  MASTER_RESUME_GET: (data: MasterResumeGetRequest) => MasterResumeGetResponse;
  MASTER_RESUME_PUT: (data: MasterResumePutRequest) => MasterResumePutResponse;

  // --- Agents (4) ---
  AGENT_PREFERENCE_GET: (data: AgentPreferenceGetRequest) => AgentPreferenceGetResponse;
  AGENT_PREFERENCE_SET: (data: AgentPreferenceSetRequest) => AgentPreferenceSetResponse;
  AGENT_REGISTRY_LIST: (data: AgentRegistryListRequest) => AgentRegistryListResponse;
  AGENT_MANIFEST_GET: (data: AgentManifestGetRequest) => AgentManifestGetResponse;

  // --- Sessions (3) ---
  SESSION_LIST: (data: SessionListRequest) => SessionListResult;
  SESSION_GET: (data: SessionGetRequest) => SessionGetResult;
  SESSION_HYDRATE_GET: (data: SessionHydrateGetRequest) => SessionHydrateGetResponse;

  // --- Session bindings (2) ---
  SESSION_BINDING_PUT: (data: SessionBindingPutRequest) => SessionBindingPutResponse;
  SESSION_BINDING_GET: (data: SessionBindingGetRequest) => SessionBindingGetResponse;

  // --- Session selection (1) ---
  /**
   * Broadcast emitted when a user explicitly selects a session from a
   * surface that owns the list (popup's SessionList). Every other surface
   * that renders session state (sidepanel) listens for this and swaps
   * its hydrated session accordingly. Read/write goes through
   * src/background/sessions/session-selection.ts so the selection also
   * persists to chrome.storage.local -- surfaces that open AFTER the
   * broadcast can still catch up.
   */
  SESSION_SELECTED: (data: {
    readonly sessionId: string;
    readonly agentId: 'job-hunter' | 'b2b-sales';
    readonly tabUrl?: string;
  }) => void;

  // --- Artifact fetch (1) ---
  /**
   * On-demand artifact download for sidepanel inline previews (CV PDF
   * iframe). The bg proxies GET /api/v1/sessions/:id/download?key=X via
   * fetchAuthed so the iframe never needs to carry the Bearer token.
   * For binary artifacts (pdf/png/jpg), the backend returns content as
   * base64; text artifacts return utf-8. The caller converts base64 to
   * a blob URL client-side so the iframe can load it.
   */
  ARTIFACT_FETCH_BLOB: (data: {
    readonly sessionId: string;
    readonly storageKey: string;
  }) =>
    | { readonly ok: true; readonly content: string; readonly mimeType: string }
    | { readonly ok: false; readonly reason: string };

  // --- Generic intent (1) ---
  GENERIC_INTENT_DETECT: (data: GenericIntentDetectRequest) => GenericIntentDetectResponse;
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
  'AUTH_COOKIE_EXCHANGE',
  'INTENT_DETECTED',
  'INTENT_GET',
  'FILL_REQUEST',
  'KEYWORDS_EXTRACT',
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
  ClientCreditsSnapshot,
  ClientProfileSnapshot,
} from './protocol-types';
export type { GenerationArtifact } from './schemas/generation.schema';
