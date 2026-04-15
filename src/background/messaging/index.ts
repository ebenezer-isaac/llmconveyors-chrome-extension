// SPDX-License-Identifier: MIT
/**
 * Messaging area barrel. Every downstream phase imports from here.
 */

export type {
  ProtocolMap,
  BgHandledKey,
  ProtocolKey,
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
  GenerationArtifact,
  ClientCreditsSnapshot,
} from './protocol';
export {
  BG_HANDLED_KEYS,
  ALL_PROTOCOL_KEYS,
  sendMessage,
  onMessage,
} from './protocol';
export { registerHandlers, __resetRegistration } from './register-handlers';
export { createHandlers } from './handlers';
export type { Handlers, HandlerDeps, HandlerFor } from './handlers';
