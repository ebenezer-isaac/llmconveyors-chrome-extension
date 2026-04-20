// SPDX-License-Identifier: MIT
import { createLogger } from '@/src/background/log';
import type { FillRequest } from '@/src/background/messaging/protocol-types';
import type { ArtifactPreview } from '@/src/background/messaging/schemas/artifact-preview.schema';

const log = createLogger('sidepanel.resume-cache');
const RESUME_CACHE_KEY = 'llmc.autofill.resume-cache.v1';
const RESUME_CACHE_VERSION = 1 as const;

type ResumeAttachment = NonNullable<FillRequest['resumeAttachment']>;

interface ResumeCacheEntry {
  readonly version: 1;
  readonly artifactCacheKey: string;
  readonly fileName: string;
  readonly mimeType: string;
  readonly contentBase64: string;
  readonly cachedAt: number;
}

type RuntimeMessenger = {
  sendMessage: (msg: unknown) => Promise<unknown>;
};

type StorageLocal = {
  get: (key: string) => Promise<Record<string, unknown>>;
  set: (items: Record<string, unknown>) => Promise<void>;
};

function getRuntime(): RuntimeMessenger | null {
  const g = globalThis as unknown as {
    chrome?: { runtime?: RuntimeMessenger };
    browser?: { runtime?: RuntimeMessenger };
  };
  return g.chrome?.runtime ?? g.browser?.runtime ?? null;
}

function getStorageLocal(): StorageLocal | null {
  const g = globalThis as unknown as {
    chrome?: { storage?: { local?: StorageLocal } };
    browser?: { storage?: { local?: StorageLocal } };
  };
  return g.chrome?.storage?.local ?? g.browser?.storage?.local ?? null;
}

function acceptedResumeMime(mimeType: string): boolean {
  const lower = mimeType.toLowerCase();
  return (
    lower.includes('pdf') ||
    lower.includes('msword') ||
    lower.includes('officedocument.wordprocessingml.document') ||
    lower.includes('octet-stream')
  );
}

function extensionForMime(mimeType: string): string {
  const lower = mimeType.toLowerCase();
  if (lower.includes('pdf')) return '.pdf';
  if (lower.includes('officedocument.wordprocessingml.document')) return '.docx';
  if (lower.includes('msword')) return '.doc';
  return '.pdf';
}

function normalizeFilename(name: string, mimeType: string): string {
  const trimmed = name.trim();
  const fallback = `Resume${extensionForMime(mimeType)}`;
  if (!trimmed) return fallback;
  if (/\.[A-Za-z0-9]{2,5}$/.test(trimmed)) return trimmed;
  return `${trimmed}${extensionForMime(mimeType)}`;
}

function asResumeCacheEntry(raw: unknown): ResumeCacheEntry | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (r.version !== RESUME_CACHE_VERSION) return null;
  if (typeof r.artifactCacheKey !== 'string' || r.artifactCacheKey.length === 0) return null;
  if (typeof r.fileName !== 'string' || r.fileName.length === 0) return null;
  if (typeof r.mimeType !== 'string' || r.mimeType.length === 0) return null;
  if (typeof r.contentBase64 !== 'string' || r.contentBase64.length === 0) return null;
  if (typeof r.cachedAt !== 'number' || !Number.isFinite(r.cachedAt) || r.cachedAt <= 0) {
    return null;
  }
  return {
    version: RESUME_CACHE_VERSION,
    artifactCacheKey: r.artifactCacheKey,
    fileName: r.fileName,
    mimeType: r.mimeType,
    contentBase64: r.contentBase64,
    cachedAt: r.cachedAt,
  };
}

function toAttachment(entry: ResumeCacheEntry): ResumeAttachment {
  return {
    fileName: entry.fileName,
    mimeType: entry.mimeType,
    contentBase64: entry.contentBase64,
  };
}

function resolveResumeArtifactKey(
  artifact: ArtifactPreview | null,
): { artifactCacheKey: string; storageKey: string; sessionId: string } | null {
  if (!artifact || artifact.type !== 'cv') return null;
  const sessionId =
    typeof artifact.sessionId === 'string' && artifact.sessionId.length > 0
      ? artifact.sessionId
      : null;
  if (!sessionId) return null;
  const storageKey =
    typeof artifact.pdfStorageKey === 'string' && artifact.pdfStorageKey.length > 0
      ? artifact.pdfStorageKey
      : typeof artifact.storageKey === 'string' &&
        artifact.storageKey.length > 0 &&
        acceptedResumeMime(artifact.mimeType ?? '')
      ? artifact.storageKey
      : null;
  if (!storageKey) return null;
  return { artifactCacheKey: `${sessionId}|${storageKey}`, storageKey, sessionId };
}

export function selectResumeArtifact(
  artifacts: readonly ArtifactPreview[],
): ArtifactPreview | null {
  for (const artifact of artifacts) {
    if (resolveResumeArtifactKey(artifact) !== null) return artifact;
  }
  return null;
}

async function readCachedEntry(): Promise<ResumeCacheEntry | null> {
  const storage = getStorageLocal();
  if (storage === null) return null;
  try {
    const raw = await storage.get(RESUME_CACHE_KEY);
    return asResumeCacheEntry(raw[RESUME_CACHE_KEY]);
  } catch (err: unknown) {
    log.warn('resume cache read failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

async function writeCachedEntry(entry: ResumeCacheEntry): Promise<void> {
  const storage = getStorageLocal();
  if (storage === null) return;
  try {
    await storage.set({ [RESUME_CACHE_KEY]: entry });
  } catch (err: unknown) {
    log.warn('resume cache write failed', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

async function fetchAttachment(
  artifact: ArtifactPreview,
  artifactKey: { artifactCacheKey: string; storageKey: string; sessionId: string },
): Promise<ResumeAttachment | null> {
  const runtime = getRuntime();
  if (runtime === null) return null;
  let raw: unknown;
  try {
    raw = await runtime.sendMessage({
      key: 'ARTIFACT_FETCH_BLOB',
      data: {
        sessionId: artifactKey.sessionId,
        storageKey: artifactKey.storageKey,
      },
    });
  } catch (err: unknown) {
    log.warn('resume preload fetch failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
  if (!raw || typeof raw !== 'object') return null;
  const env = raw as {
    ok?: boolean;
    content?: string;
    mimeType?: string;
    reason?: string;
  };
  if (env.ok !== true || typeof env.content !== 'string' || env.content.length === 0) {
    if (typeof env.reason === 'string') {
      log.info('resume preload not available', { reason: env.reason });
    }
    return null;
  }
  const mimeType = typeof env.mimeType === 'string' ? env.mimeType : 'application/pdf';
  if (!acceptedResumeMime(mimeType)) {
    log.warn('resume preload rejected unexpected mime', { mimeType });
    return null;
  }
  const fileName = normalizeFilename(artifact.filename, mimeType);
  const entry: ResumeCacheEntry = {
    version: RESUME_CACHE_VERSION,
    artifactCacheKey: artifactKey.artifactCacheKey,
    fileName,
    mimeType,
    contentBase64: env.content,
    cachedAt: Date.now(),
  };
  await writeCachedEntry(entry);
  return toAttachment(entry);
}

export async function getOrPreloadResumeAttachment(
  artifact: ArtifactPreview | null,
): Promise<ResumeAttachment | null> {
  const artifactKey = resolveResumeArtifactKey(artifact);
  if (artifactKey === null) return null;

  const cached = await readCachedEntry();
  if (cached && cached.artifactCacheKey === artifactKey.artifactCacheKey) {
    return toAttachment(cached);
  }

  if (artifact === null) return null;
  return fetchAttachment(artifact, artifactKey);
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function extractStructuredDataFromPayload(
  payload: Record<string, unknown> | undefined,
): Record<string, unknown> | null {
  if (!payload) return null;
  log.debug('extractStructuredDataFromPayload: input shape', {
    topKeys: Object.keys(payload).slice(0, 15),
    hasStructuredData: isPlainObject(payload.structuredData),
    hasBasics: 'basics' in payload,
    basicsType: typeof payload.basics,
    basicsIsNull: payload.basics === null,
    hasWork: 'work' in payload,
    workIsArray: Array.isArray(payload.work),
    hasSections: isPlainObject(payload.sections),
  });
  if (isPlainObject(payload.structuredData)) {
    const sd = payload.structuredData;
    log.debug('extractStructuredDataFromPayload: returning .structuredData', {
      sdKeys: Object.keys(sd).slice(0, 15),
      sdHasBasics: 'basics' in sd,
      sdBasicsType: typeof sd.basics,
      sdBasicsIsNull: sd.basics === null,
      sdHasSections: 'sections' in sd,
      sdHasWork: 'work' in sd,
    });
    return sd;
  }
  if (isPlainObject(payload.basics) || Array.isArray(payload.work)) {
    log.debug('extractStructuredDataFromPayload: returning payload as JSON-Resume', {
      basicsIsPlainObj: isPlainObject(payload.basics),
      workIsArray: Array.isArray(payload.work),
    });
    return payload;
  }
  if (isPlainObject(payload.sections)) {
    log.debug('extractStructuredDataFromPayload: returning payload as Rx-Resume (has .sections)');
    return payload;
  }
  log.debug('extractStructuredDataFromPayload: no recognizable shape -- returning null', {
    topKeys: Object.keys(payload).slice(0, 15),
  });
  return null;
}

export async function getProfileDataFromArtifact(
  artifact: ArtifactPreview | null,
): Promise<Record<string, unknown> | null> {
  log.debug('getProfileDataFromArtifact: entry', {
    hasArtifact: artifact !== null,
    artifactType: artifact?.type ?? null,
    artifactKind: typeof (artifact as unknown as Record<string, unknown> | null)?.kind === 'string'
      ? (artifact as unknown as Record<string, unknown>).kind
      : null,
  });
  if (!artifact || artifact.type !== 'cv') {
    log.debug('getProfileDataFromArtifact: skipping -- artifact null or not cv', {
      artifactType: artifact?.type ?? null,
    });
    return null;
  }

  log.debug('getProfileDataFromArtifact: trying payload extraction', {
    hasPayload: artifact.payload !== undefined && artifact.payload !== null,
    payloadType: typeof artifact.payload,
  });
  const fromPayload = extractStructuredDataFromPayload(
    artifact.payload as Record<string, unknown> | undefined,
  );
  if (fromPayload) {
    const basics = fromPayload.basics;
    const basicsObj = isPlainObject(basics) ? basics : null;
    log.info('profile data extracted from artifact payload', {
      topKeys: Object.keys(fromPayload).slice(0, 15),
      hasBasics: 'basics' in fromPayload,
      basicsIsNull: basics === null,
      basicsType: typeof basics,
      basicsKeys: basicsObj ? Object.keys(basicsObj).slice(0, 15) : [],
      basicsHasItems: basicsObj ? Array.isArray(basicsObj.items) : false,
      basicsHasName: basicsObj ? typeof basicsObj.name === 'string' : false,
      basicsHasEmail: basicsObj ? typeof basicsObj.email === 'string' : false,
      basicsHasFirstName: basicsObj ? typeof basicsObj.firstName === 'string' : false,
      hasSections: 'sections' in fromPayload,
      hasWork: 'work' in fromPayload,
      workIsArray: Array.isArray(fromPayload.work),
    });
    return fromPayload;
  }
  log.debug('getProfileDataFromArtifact: payload extraction returned null, trying blob fetch');

  const sessionId =
    typeof artifact.sessionId === 'string' && artifact.sessionId.length > 0
      ? artifact.sessionId
      : null;
  const storageKey =
    typeof artifact.storageKey === 'string' && artifact.storageKey.length > 0
      ? artifact.storageKey
      : null;

  log.debug('getProfileDataFromArtifact: blob fetch params', {
    hasSessionId: sessionId !== null,
    hasStorageKey: storageKey !== null,
    storageKeySuffix: storageKey ? storageKey.slice(-20) : null,
  });
  if (!sessionId || !storageKey) {
    log.warn('getProfileDataFromArtifact: missing sessionId or storageKey -- cannot fetch blob');
    return null;
  }

  const runtime = getRuntime();
  if (runtime === null) {
    log.warn('getProfileDataFromArtifact: chrome runtime unavailable');
    return null;
  }

  let raw: unknown;
  try {
    log.debug('getProfileDataFromArtifact: sending ARTIFACT_FETCH_BLOB', { sessionId, storageKey });
    raw = await runtime.sendMessage({
      key: 'ARTIFACT_FETCH_BLOB',
      data: { sessionId, storageKey },
    });
  } catch (err: unknown) {
    log.warn('profile data fetch failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }

  log.debug('getProfileDataFromArtifact: ARTIFACT_FETCH_BLOB response', {
    rawType: typeof raw,
    rawIsNull: raw === null,
    rawKeys: (raw !== null && typeof raw === 'object') ? Object.keys(raw as Record<string,unknown>).slice(0, 10) : [],
  });
  if (!raw || typeof raw !== 'object') {
    log.warn('getProfileDataFromArtifact: blob response not an object');
    return null;
  }
  const env = raw as { ok?: boolean; content?: string; mimeType?: string };
  log.debug('getProfileDataFromArtifact: blob envelope', {
    ok: env.ok,
    mimeType: env.mimeType,
    contentLength: typeof env.content === 'string' ? env.content.length : null,
  });
  if (env.ok !== true || typeof env.content !== 'string') {
    log.warn('getProfileDataFromArtifact: blob envelope not ok or no content', { ok: env.ok });
    return null;
  }

  const mimeType = typeof env.mimeType === 'string' ? env.mimeType : '';
  const isJson = mimeType.includes('json') || storageKey.endsWith('.json');
  log.debug('getProfileDataFromArtifact: content type check', { mimeType, isJson });
  if (!isJson) {
    log.warn('getProfileDataFromArtifact: blob is not JSON -- cannot use as profile', { mimeType, storageKey });
    return null;
  }

  try {
    const parsed = JSON.parse(env.content);
    log.debug('getProfileDataFromArtifact: parsed blob JSON', {
      parsedType: typeof parsed,
      parsedIsNull: parsed === null,
      parsedIsArray: Array.isArray(parsed),
      parsedTopKeys: isPlainObject(parsed) ? Object.keys(parsed as Record<string,unknown>).slice(0, 15) : [],
    });
    if (!isPlainObject(parsed)) {
      log.warn('getProfileDataFromArtifact: parsed blob is not a plain object');
      return null;
    }

    const extracted = extractStructuredDataFromPayload(parsed as Record<string, unknown>);
    if (extracted) {
      const basics = extracted.basics;
      const basicsObj = isPlainObject(basics) ? basics : null;
      log.info('profile data fetched from storage', {
        topKeys: Object.keys(extracted).slice(0, 15),
        hasBasics: 'basics' in extracted,
        basicsIsNull: basics === null,
        basicsType: typeof basics,
        basicsKeys: basicsObj ? Object.keys(basicsObj).slice(0, 15) : [],
        basicsHasItems: basicsObj ? Array.isArray(basicsObj.items) : false,
        basicsHasName: basicsObj ? typeof basicsObj.name === 'string' : false,
        basicsHasEmail: basicsObj ? typeof basicsObj.email === 'string' : false,
        basicsHasFirstName: basicsObj ? typeof basicsObj.firstName === 'string' : false,
        hasSections: 'sections' in extracted,
        hasWork: 'work' in extracted,
        workIsArray: Array.isArray(extracted.work),
      });
      return extracted;
    }

    log.warn('getProfileDataFromArtifact: extractStructuredDataFromPayload returned null from blob', {
      parsedTopKeys: Object.keys(parsed as Record<string,unknown>).slice(0, 15),
    });
    if (isPlainObject(parsed)) {
      log.info('profile data using fetched JSON as-is');
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch (err: unknown) {
    log.warn('profile data JSON parse failed', { error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}
