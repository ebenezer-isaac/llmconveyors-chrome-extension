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
} from './schemas/auth.schema';
import type {
  ProfileGetRequestSchema,
  ProfileGetResponseSchema,
  ProfileUpdateRequestSchema,
  ProfileUpdateResponseSchema,
  ProfileUploadJsonResumeRequestSchema,
  ProfileUploadJsonResumeResponseSchema,
} from './schemas/profile-messages.schema';
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
} from './schemas/generation.schema';
import type {
  CreditsGetRequestSchema,
  CreditsStateSchema,
} from './schemas/credits.schema';

// Auth
export type AuthSignInRequest = z.infer<typeof AuthSignInRequestSchema>;
export type AuthSignOutRequest = z.infer<typeof AuthSignOutRequestSchema>;
export type AuthStatusRequest = z.infer<typeof AuthStatusRequestSchema>;
export type AuthSignInResponse = z.infer<typeof AuthSignInResponseSchema>;
export type AuthSignOutResponse = z.infer<typeof AuthSignOutResponseSchema>;
export type AuthState = z.infer<typeof AuthStateSchema>;
export type StoredSession = z.infer<typeof StoredSessionSchema>;

// Profile messaging
export type ProfileGetRequest = z.infer<typeof ProfileGetRequestSchema>;
export type ProfileGetResponse = z.infer<typeof ProfileGetResponseSchema>;
export type ProfileUpdateRequest = z.infer<typeof ProfileUpdateRequestSchema>;
export type ProfileUpdateResponse = z.infer<typeof ProfileUpdateResponseSchema>;
export type ProfileUploadJsonResumeRequest = z.infer<
  typeof ProfileUploadJsonResumeRequestSchema
>;
export type ProfileUploadJsonResumeResponse = z.infer<
  typeof ProfileUploadJsonResumeResponseSchema
>;

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
export type CreditsState = z.infer<typeof CreditsStateSchema>;

export type { Profile } from './schemas/profile.schema';
