// SPDX-License-Identifier: MIT
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getOrPreloadResumeAttachment,
  selectResumeArtifact,
} from '@/entrypoints/sidepanel/lib/autofill-resume-cache';
import type { ArtifactPreview } from '@/src/background/messaging/schemas/artifact-preview.schema';

function makeArtifact(overrides: Partial<ArtifactPreview> = {}): ArtifactPreview {
  return {
    type: 'cv',
    label: 'Resume',
    content: null,
    mimeType: 'application/pdf',
    downloadUrl: null,
    storageKey: 'users/u/sessions/s1/cv.json',
    pdfStorageKey: 'users/u/sessions/s1/cv.pdf',
    sessionId: 's1',
    filename: 'Resume.pdf',
    ...overrides,
  };
}

function installChrome(opts: {
  readonly cached?: unknown;
  readonly fetchResponse?: unknown;
}): {
  readonly sendMessage: ReturnType<typeof vi.fn>;
  readonly storageSet: ReturnType<typeof vi.fn>;
} {
  const sendMessage = vi.fn(async () => opts.fetchResponse);
  const storageSet = vi.fn(async () => undefined);
  (globalThis as unknown as {
    chrome: {
      runtime: { sendMessage: typeof sendMessage };
      storage: {
        local: {
          get: (key: string) => Promise<Record<string, unknown>>;
          set: typeof storageSet;
        };
      };
    };
  }).chrome = {
    runtime: { sendMessage },
    storage: {
      local: {
        get: async () => ({ 'llmc.autofill.resume-cache.v1': opts.cached }),
        set: storageSet,
      },
    },
  };
  return { sendMessage, storageSet };
}

describe('autofill resume cache', () => {
  afterEach(() => {
    delete (globalThis as { chrome?: unknown }).chrome;
  });

  it('selectResumeArtifact picks the first usable cv artifact', () => {
    const selected = selectResumeArtifact([
      makeArtifact({ type: 'cover-letter', pdfStorageKey: null }),
      makeArtifact({ sessionId: null, pdfStorageKey: null }),
      makeArtifact(),
    ]);
    expect(selected?.type).toBe('cv');
    expect(selected?.pdfStorageKey).toBe('users/u/sessions/s1/cv.pdf');
  });

  it('reuses cached attachment when artifact key matches', async () => {
    const { sendMessage } = installChrome({
      cached: {
        version: 1,
        artifactCacheKey: 's1|users/u/sessions/s1/cv.pdf',
        fileName: 'Resume.pdf',
        mimeType: 'application/pdf',
        contentBase64: 'YWJjZA==',
        cachedAt: Date.now(),
      },
    });
    const out = await getOrPreloadResumeAttachment(makeArtifact());
    expect(out).toEqual({
      fileName: 'Resume.pdf',
      mimeType: 'application/pdf',
      contentBase64: 'YWJjZA==',
    });
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('fetches and stores attachment when cache miss', async () => {
    const { sendMessage, storageSet } = installChrome({
      cached: null,
      fetchResponse: {
        ok: true,
        content: 'YWJjZA==',
        mimeType: 'application/pdf',
      },
    });
    const out = await getOrPreloadResumeAttachment(makeArtifact());
    expect(out).toEqual({
      fileName: 'Resume.pdf',
      mimeType: 'application/pdf',
      contentBase64: 'YWJjZA==',
    });
    expect(sendMessage).toHaveBeenCalledWith({
      key: 'ARTIFACT_FETCH_BLOB',
      data: {
        sessionId: 's1',
        storageKey: 'users/u/sessions/s1/cv.pdf',
      },
    });
    expect(storageSet).toHaveBeenCalledTimes(1);
  });
});
