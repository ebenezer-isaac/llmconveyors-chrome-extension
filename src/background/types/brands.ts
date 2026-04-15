// SPDX-License-Identifier: MIT
/**
 * Branded primitive IDs (D16).
 *
 * Branded strings give compile-time separation between kinds of IDs without
 * any runtime cost. A raw `string` cannot be passed where `TabId` is expected
 * and vice versa.
 */

declare const __brand: unique symbol;
type Brand<T, B> = T & { readonly [__brand]: B };

export type TabId = Brand<number, 'TabId'>;
export type GenerationId = Brand<string, 'GenerationId'>;
export type SessionId = Brand<string, 'SessionId'>;
export type RequestId = Brand<string, 'RequestId'>;
export type PlanId = Brand<string, 'PlanId'>;
export type UserId = Brand<string, 'UserId'>;

export function asTabId(n: number): TabId {
  return n as TabId;
}

export function asGenerationId(s: string): GenerationId {
  return s as GenerationId;
}

export function asSessionId(s: string): SessionId {
  return s as SessionId;
}

export function asRequestId(s: string): RequestId {
  return s as RequestId;
}

export function asPlanId(s: string): PlanId {
  return s as PlanId;
}

export function asUserId(s: string): UserId {
  return s as UserId;
}

/** Crypto-free deterministic id factory used by background handlers. */
export function newRequestId(): RequestId {
  const rand = Math.random().toString(36).slice(2, 10);
  return asRequestId(`req_${Date.now().toString(36)}_${rand}`);
}

export function newGenerationId(): GenerationId {
  const rand = Math.random().toString(36).slice(2, 10);
  return asGenerationId(`gen_${Date.now().toString(36)}_${rand}`);
}

export function newPlanId(): PlanId {
  const rand = Math.random().toString(36).slice(2, 10);
  return asPlanId(`plan_${Date.now().toString(36)}_${rand}`);
}

export function newSessionId(): SessionId {
  const rand = Math.random().toString(36).slice(2, 10);
  return asSessionId(`sess_${Date.now().toString(36)}_${rand}`);
}
