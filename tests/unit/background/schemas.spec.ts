// SPDX-License-Identifier: MIT
import { describe, it, expect } from 'vitest';
import {
  DetectedIntentPayloadSchema,
  KeywordsExtractRequestSchema,
  ExtractSkillsBackendResponseSchema,
  AuthStateSchema,
  UNAUTHED,
} from '../../../src/background/messaging/schemas';

describe('DetectedIntentPayloadSchema', () => {
  it('accepts a tabId=-1 sentinel', () => {
    const r = DetectedIntentPayloadSchema.safeParse({
      tabId: -1,
      url: 'https://boards.greenhouse.io/foo/jobs/123',
      kind: 'greenhouse',
      pageKind: 'job-posting',
      detectedAt: Date.now(),
    });
    expect(r.success).toBe(true);
  });
  it('rejects unknown ATS kind value', () => {
    const r = DetectedIntentPayloadSchema.safeParse({
      tabId: 1,
      url: 'https://x.y/z',
      kind: 'icims',
      pageKind: 'job-posting',
      detectedAt: 1,
    });
    expect(r.success).toBe(false);
  });
  it('rejects url > 2048 chars', () => {
    const r = DetectedIntentPayloadSchema.safeParse({
      tabId: 1,
      url: 'https://x.y/' + 'a'.repeat(3000),
      kind: 'greenhouse',
      pageKind: 'job-posting',
      detectedAt: 1,
    });
    expect(r.success).toBe(false);
  });
});

describe('KeywordsExtractRequestSchema', () => {
  it('rejects empty text', () => {
    const r = KeywordsExtractRequestSchema.safeParse({ text: '', url: 'https://x.y' });
    expect(r.success).toBe(false);
  });
  it('rejects text > 50k chars', () => {
    const r = KeywordsExtractRequestSchema.safeParse({
      text: 'a'.repeat(50_001),
      url: 'https://x.y',
    });
    expect(r.success).toBe(false);
  });
  it('rejects topK > 100', () => {
    const r = KeywordsExtractRequestSchema.safeParse({
      text: 'hello',
      url: 'https://x.y',
      topK: 200,
    });
    expect(r.success).toBe(false);
  });
});

describe('ExtractSkillsBackendResponseSchema', () => {
  it('accepts a valid envelope', () => {
    const r = ExtractSkillsBackendResponseSchema.safeParse({
      success: true,
      data: {
        keywords: [
          {
            term: 'typescript',
            category: 'hard',
            score: 0.9,
            occurrences: 3,
            canonicalForm: 'typescript',
          },
        ],
        tookMs: 42,
      },
    });
    expect(r.success).toBe(true);
  });
  it('rejects keywords array > 500', () => {
    const r = ExtractSkillsBackendResponseSchema.safeParse({
      success: true,
      data: {
        keywords: Array.from({ length: 501 }, () => ({
          term: 'x',
          category: 'hard' as const,
          score: 0.5,
          occurrences: 1,
          canonicalForm: 'x',
        })),
        tookMs: 0,
      },
    });
    expect(r.success).toBe(false);
  });
});

describe('AuthStateSchema', () => {
  it('accepts signedIn true with userId', () => {
    const r = AuthStateSchema.safeParse({ signedIn: true, userId: 'u1' });
    expect(r.success).toBe(true);
  });
  it('accepts signedIn false without any extra fields', () => {
    const r = AuthStateSchema.safeParse({ signedIn: false });
    expect(r.success).toBe(true);
  });
  it('rejects signedIn false with extra fields (strict)', () => {
    const r = AuthStateSchema.safeParse({ signedIn: false, userId: 'u' });
    expect(r.success).toBe(false);
  });
  it('UNAUTHED constant is valid', () => {
    const r = AuthStateSchema.safeParse(UNAUTHED);
    expect(r.success).toBe(true);
  });
});
