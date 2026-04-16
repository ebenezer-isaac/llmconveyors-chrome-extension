// SPDX-License-Identifier: MIT
/**
 * Value types for the ProtocolMap. Inferred from the Zod schemas under
 * `./schemas/` so the type-level contract and the runtime validator can
 * never drift.
 */

import type { z } from 'zod';
import type {
  AuthSignInRequestSchema,
  AuthSignOutRequestSchema,
  AuthStatusRequestSchema,
  AuthSignInResponseSchema,
  AuthSignOutResponseSchema,
  AuthStateSchema,
  StoredSessionSchema,
  AuthCookieExchangeRequestSchema,
} from './schemas/auth.schema';
import type {
  DetectedIntentSchema,
  DetectedIntentPayloadSchema,
  IntentGetRequestSchema,
  DetectedJobBroadcastSchema,
} from './schemas/intent.schema';
import type {
  FillRequestSchema,
  FillRequestResponseSchema,
} from './schemas/fill.schema';
import type {
  KeywordsExtractRequestSchema,
  KeywordsExtractResponseSchema,
} from './schemas/keywords.schema';
import type {
  HighlightApplyRequestSchema,
  HighlightApplyResponseSchema,
  HighlightClearRequestSchema,
  HighlightClearResponseSchema,
  HighlightStatusRequestSchema,
  HighlightStatusSchema,
} from './schemas/highlight.schema';
import type {
  GenerationStartRequestSchema,
  GenerationStartResponseSchema,
  GenerationUpdateBroadcastSchema,
  GenerationCancelRequestSchema,
  GenerationCancelResponseSchema,
  GenerationSubscribeRequestSchema,
  GenerationSubscribeResponseSchema,
  GenerationInteractRequestSchema,
  GenerationInteractResponseSchema,
} from './schemas/generation.schema';
import type {
  CreditsGetRequestSchema,
  ClientCreditsSnapshotSchema,
} from './schemas/credits.schema';
import type {
  ProfileGetRequestSchema,
  ClientProfileSnapshotSchema,
} from './schemas/profile.schema';
import type {
  SessionListRequestSchema,
  SessionListResultSchema,
  SessionGetRequestSchema,
  SessionGetResultSchema,
  SessionHydrateGetRequestSchema,
  SessionHydrateGetResponseSchema,
} from './schemas/session-list.schema';
import type {
  GenericIntentDetectRequestSchema,
  GenericIntentDetectResponseSchema,
} from './schemas/generic-intent.schema';
import type {
  SessionBindingPutRequestSchema,
  SessionBindingPutResponseSchema,
  SessionBindingGetRequestSchema,
  SessionBindingGetResponseSchema,
} from './schemas/session-binding.schema';

// Auth
export type AuthSignInRequest = z.infer<typeof AuthSignInRequestSchema>;
export type AuthSignOutRequest = z.infer<typeof AuthSignOutRequestSchema>;
export type AuthStatusRequest = z.infer<typeof AuthStatusRequestSchema>;
export type AuthSignInResponse = z.infer<typeof AuthSignInResponseSchema>;
export type AuthSignOutResponse = z.infer<typeof AuthSignOutResponseSchema>;
export type AuthState = z.infer<typeof AuthStateSchema>;
export type StoredSession = z.infer<typeof StoredSessionSchema>;
export type AuthCookieExchangeRequest = z.infer<typeof AuthCookieExchangeRequestSchema>;

// Intent
export type DetectedIntent = z.infer<typeof DetectedIntentSchema>;
export type DetectedIntentPayload = z.infer<typeof DetectedIntentPayloadSchema>;
export type IntentGetRequest = z.infer<typeof IntentGetRequestSchema>;
export type IntentGetResponse = DetectedIntent | null;
export type DetectedJobBroadcast = z.infer<typeof DetectedJobBroadcastSchema>;

// Fill
export type FillRequest = z.infer<typeof FillRequestSchema>;
export type FillRequestResponse = z.infer<typeof FillRequestResponseSchema>;

// Keywords
export type KeywordsExtractRequest = z.infer<typeof KeywordsExtractRequestSchema>;
export type KeywordsExtractResponse = z.infer<typeof KeywordsExtractResponseSchema>;

// Highlight
export type HighlightApplyRequest = z.infer<typeof HighlightApplyRequestSchema>;
export type HighlightApplyResponse = z.infer<typeof HighlightApplyResponseSchema>;
export type HighlightClearRequest = z.infer<typeof HighlightClearRequestSchema>;
export type HighlightClearResponse = z.infer<typeof HighlightClearResponseSchema>;
export type HighlightStatusRequest = z.infer<typeof HighlightStatusRequestSchema>;
export type HighlightStatus = z.infer<typeof HighlightStatusSchema>;

// Generation
export type GenerationStartRequest = z.infer<typeof GenerationStartRequestSchema>;
export type GenerationStartResponse = z.infer<typeof GenerationStartResponseSchema>;
export type GenerationUpdateBroadcast = z.infer<
  typeof GenerationUpdateBroadcastSchema
>;
export type GenerationCancelRequest = z.infer<typeof GenerationCancelRequestSchema>;
export type GenerationCancelResponse = z.infer<typeof GenerationCancelResponseSchema>;

// Credits
export type CreditsGetRequest = z.infer<typeof CreditsGetRequestSchema>;
export type ClientCreditsSnapshot = z.infer<typeof ClientCreditsSnapshotSchema>;

// Profile
export type ProfileGetRequest = z.infer<typeof ProfileGetRequestSchema>;
export type ClientProfileSnapshot = z.infer<typeof ClientProfileSnapshotSchema>;

// Generation (extensions)
export type GenerationSubscribeRequest = z.infer<typeof GenerationSubscribeRequestSchema>;
export type GenerationSubscribeResponse = z.infer<typeof GenerationSubscribeResponseSchema>;
export type GenerationInteractRequest = z.infer<typeof GenerationInteractRequestSchema>;
export type GenerationInteractResponse = z.infer<typeof GenerationInteractResponseSchema>;

// Sessions
export type SessionListRequest = z.infer<typeof SessionListRequestSchema>;
export type SessionListResult = z.infer<typeof SessionListResultSchema>;
export type SessionGetRequest = z.infer<typeof SessionGetRequestSchema>;
export type SessionGetResult = z.infer<typeof SessionGetResultSchema>;
export type SessionHydrateGetRequest = z.infer<typeof SessionHydrateGetRequestSchema>;
export type SessionHydrateGetResponse = z.infer<typeof SessionHydrateGetResponseSchema>;

// Generic intent
export type GenericIntentDetectRequest = z.infer<typeof GenericIntentDetectRequestSchema>;
export type GenericIntentDetectResponse = z.infer<typeof GenericIntentDetectResponseSchema>;

// Session bindings
export type SessionBindingPutRequest = z.infer<typeof SessionBindingPutRequestSchema>;
export type SessionBindingPutResponse = z.infer<typeof SessionBindingPutResponseSchema>;
export type SessionBindingGetRequest = z.infer<typeof SessionBindingGetRequestSchema>;
export type SessionBindingGetResponse = z.infer<typeof SessionBindingGetResponseSchema>;
