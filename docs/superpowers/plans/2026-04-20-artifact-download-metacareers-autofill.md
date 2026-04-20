# Artifact Download Fix + Meta Careers Autofill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix artifact downloads for all types (text, PDF) and enable autofill on metacareers.com

**Architecture:** Two-phase approach: (1) Fix ArtifactCard download handler with async blob fetch and loading states, (2) Add metacareers.com to content script matches to enable generic autofill. The extension already has a generic form filler that works without a dedicated adapter.

**Tech Stack:** React, TypeScript, chrome.downloads API, ARTIFACT_FETCH_BLOB message handler, ats-autofill-engine/dom generic scanner

---

## File Structure

### Phase 1: Download Fix (Chrome Extension)

| File | Action | Responsibility |
|------|--------|----------------|
| `entrypoints/sidepanel/artifacts/ArtifactCard.tsx` | Modify | Add download state, async handler, loading UI |
| `entrypoints/sidepanel/lib/download.ts` | Modify | Add `downloadBase64` helper for binary content |
| `tests/unit/sidepanel/artifacts/ArtifactCard.spec.tsx` | Create | Unit tests for download logic |

### Phase 2: Meta Careers Autofill (Chrome Extension)

| File | Action | Responsibility |
|------|--------|----------------|
| `entrypoints/ats.content/index.ts` | Modify | Add metacareers.com to matches |
| `src/content/autofill/adapter-loader.ts` | Modify | Add metacareers kind resolution |
| `src/content/autofill/deps-factory.ts` | Modify | Add metacareers to static imports |

---

## Phase 1: Artifact Download Fix

### Task 1: Add downloadBase64 helper to download.ts

**Files:**
- Modify: `entrypoints/sidepanel/lib/download.ts`

- [ ] **Step 1: Read the current download.ts implementation**

```bash
cat entrypoints/sidepanel/lib/download.ts
```

- [ ] **Step 2: Add downloadBase64 function after downloadBlob**

Add this function to handle base64-encoded binary content (PDFs):

```typescript
/**
 * Save base64-encoded binary content as a file. Decodes base64 to bytes,
 * wraps in a Blob, and hands to chrome.downloads.
 */
export async function downloadBase64(
  base64Content: string,
  filename: string,
  mimeType: string,
  opts: { saveAs?: boolean } = {},
): Promise<boolean> {
  const api = getDownloads();
  if (api === null) {
    log.warn('chrome.downloads unavailable', { filename });
    return false;
  }
  let blobUrl: string | null = null;
  try {
    // Decode base64 to bytes
    const U8 = Uint8Array as unknown as {
      fromBase64?: (b: string) => Uint8Array;
    };
    let bytes: Uint8Array;
    if (typeof U8.fromBase64 === 'function') {
      bytes = U8.fromBase64(base64Content);
    } else {
      const binary = atob(base64Content);
      const len = binary.length;
      bytes = new Uint8Array(len);
      for (let i = 0; i < len; i += 1) bytes[i] = binary.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: mimeType });
    blobUrl = URL.createObjectURL(blob);
    await api.download({ url: blobUrl, filename, saveAs: opts.saveAs === true });
    return true;
  } catch (err: unknown) {
    log.warn('downloadBase64 failed', {
      filename,
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  } finally {
    if (blobUrl !== null) {
      const toRevoke = blobUrl;
      setTimeout(() => {
        try {
          URL.revokeObjectURL(toRevoke);
        } catch {
          // nothing to do
        }
      }, 30_000);
    }
  }
}
```

- [ ] **Step 3: Verify the file compiles**

```bash
pnpm typecheck
```

Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add entrypoints/sidepanel/lib/download.ts
git commit -m "feat(sidepanel): add downloadBase64 helper for binary artifacts"
```

---

### Task 2: Update ArtifactCard with async download handler

**Files:**
- Modify: `entrypoints/sidepanel/artifacts/ArtifactCard.tsx`

- [ ] **Step 1: Add download state and runtime helper**

At the top of the file, add the state type and runtime helper:

```typescript
import React, { useCallback, useState } from 'react';
import type { ArtifactPreview } from '@/src/background/messaging/schemas/artifact-preview.schema';
import { downloadBlob, downloadUrl, downloadBase64 } from '../lib/download';
import { copyToClipboard } from '../lib/clipboard';
// ... existing imports ...

type DownloadState = 'idle' | 'loading' | 'success' | 'error';

type RuntimeMessenger = {
  sendMessage: (msg: unknown) => Promise<unknown>;
};

function getRuntime(): RuntimeMessenger | null {
  const g = globalThis as unknown as {
    chrome?: { runtime?: RuntimeMessenger };
    browser?: { runtime?: RuntimeMessenger };
  };
  return g.chrome?.runtime ?? g.browser?.runtime ?? null;
}

async function fetchArtifactBlob(
  sessionId: string,
  storageKey: string,
): Promise<{ ok: true; content: string; mimeType: string } | { ok: false; reason: string }> {
  const runtime = getRuntime();
  if (runtime === null) {
    return { ok: false, reason: 'runtime-unavailable' };
  }
  try {
    const raw = await runtime.sendMessage({
      key: 'ARTIFACT_FETCH_BLOB',
      data: { sessionId, storageKey },
    });
    if (!raw || typeof raw !== 'object') {
      return { ok: false, reason: 'empty-response' };
    }
    const env = raw as {
      ok?: boolean;
      content?: string;
      mimeType?: string;
      reason?: string;
    };
    if (env.ok !== true || typeof env.content !== 'string') {
      return { ok: false, reason: typeof env.reason === 'string' ? env.reason : 'fetch-failed' };
    }
    return {
      ok: true,
      content: env.content,
      mimeType: typeof env.mimeType === 'string' ? env.mimeType : 'application/octet-stream',
    };
  } catch (err: unknown) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
}
```

- [ ] **Step 2: Replace handleDownload in ArtifactCard component**

Replace the existing `handleDownload` callback:

```typescript
export function ArtifactCard({
  artifact,
  defaultOpen = false,
}: ArtifactCardProps): React.ReactElement {
  const [open, setOpen] = useState<boolean>(defaultOpen);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [downloadState, setDownloadState] = useState<DownloadState>('idle');

  const toggle = useCallback(() => setOpen((v) => !v), []);

  const handleDownload = useCallback(async () => {
    if (downloadState === 'loading') return;
    setDownloadState('loading');

    try {
      // Priority 1: PDF artifacts with pdfStorageKey (Resume)
      if (artifact.pdfStorageKey && artifact.sessionId) {
        const result = await fetchArtifactBlob(artifact.sessionId, artifact.pdfStorageKey);
        if (result.ok) {
          const success = await downloadBase64(result.content, artifact.filename, result.mimeType);
          setDownloadState(success ? 'success' : 'error');
          if (success) setTimeout(() => setDownloadState('idle'), 1500);
          return;
        }
        // Fall through to try other methods
      }

      // Priority 2: Signed download URL
      if (artifact.downloadUrl !== null) {
        const success = await downloadUrl(artifact.downloadUrl, artifact.filename);
        setDownloadState(success ? 'success' : 'error');
        if (success) setTimeout(() => setDownloadState('idle'), 1500);
        return;
      }

      // Priority 3: Inline content (Company Research, Cover Letter)
      if (artifact.content !== null) {
        const mimeType = artifact.mimeType ?? 'text/plain';
        const success = await downloadBlob(artifact.content, artifact.filename, mimeType);
        setDownloadState(success ? 'success' : 'error');
        if (success) setTimeout(() => setDownloadState('idle'), 1500);
        return;
      }

      // Priority 4: Fetch via storageKey (fallback)
      if (artifact.storageKey && artifact.sessionId) {
        const result = await fetchArtifactBlob(artifact.sessionId, artifact.storageKey);
        if (result.ok) {
          // Check if binary or text based on mimeType
          const isBinary = result.mimeType.startsWith('application/') && 
                           !result.mimeType.includes('json') &&
                           !result.mimeType.includes('text');
          const success = isBinary
            ? await downloadBase64(result.content, artifact.filename, result.mimeType)
            : await downloadBlob(result.content, artifact.filename, result.mimeType);
          setDownloadState(success ? 'success' : 'error');
          if (success) setTimeout(() => setDownloadState('idle'), 1500);
          return;
        }
      }

      setDownloadState('error');
      setTimeout(() => setDownloadState('idle'), 2000);
    } catch {
      setDownloadState('error');
      setTimeout(() => setDownloadState('idle'), 2000);
    }
  }, [artifact, downloadState]);
```

- [ ] **Step 3: Update the Download button to show loading/success/error states**

Replace the existing Download button JSX:

```typescript
{canDownload ? (
  <button
    type="button"
    onClick={handleDownload}
    disabled={downloadState === 'loading'}
    data-testid="artifact-card-download"
    aria-label="Download artifact"
    className={`rounded-card border px-2 py-0.5 text-[10px] hover:bg-zinc-50 dark:hover:bg-zinc-800 ${
      downloadState === 'error'
        ? 'border-red-300 text-red-600 dark:border-red-700 dark:text-red-400'
        : downloadState === 'success'
        ? 'border-emerald-300 text-emerald-600 dark:border-emerald-700 dark:text-emerald-400'
        : 'border-zinc-200 text-zinc-700 dark:border-zinc-700 dark:text-zinc-200'
    } ${downloadState === 'loading' ? 'opacity-60 cursor-wait' : ''}`}
  >
    {downloadState === 'loading'
      ? 'Downloading...'
      : downloadState === 'success'
      ? 'Downloaded'
      : downloadState === 'error'
      ? 'Failed'
      : 'Download'}
  </button>
) : null}
```

- [ ] **Step 4: Verify the file compiles**

```bash
pnpm typecheck
```

Expected: No errors

- [ ] **Step 5: Test manually in the browser**

1. Run `pnpm dev`
2. Open the extension sidepanel on a page with artifacts
3. Click Download on Company Research - should download text file
4. Click Download on Resume - should download PDF
5. Click Download on Cover Letter - should download text file

- [ ] **Step 6: Commit**

```bash
git add entrypoints/sidepanel/artifacts/ArtifactCard.tsx
git commit -m "feat(sidepanel): fix artifact download for all types (text, PDF)"
```

---

### Task 3: Add unit tests for ArtifactCard download

**Files:**
- Create: `tests/unit/sidepanel/artifacts/ArtifactCard.spec.tsx`

- [ ] **Step 1: Create test file with mocks**

```typescript
// tests/unit/sidepanel/artifacts/ArtifactCard.spec.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ArtifactCard } from '@/entrypoints/sidepanel/artifacts/ArtifactCard';
import type { ArtifactPreview } from '@/src/background/messaging/schemas/artifact-preview.schema';

// Mock chrome.downloads
const mockDownload = vi.fn().mockResolvedValue(1);
const mockSendMessage = vi.fn();

beforeEach(() => {
  vi.stubGlobal('chrome', {
    downloads: { download: mockDownload },
    runtime: { sendMessage: mockSendMessage },
  });
  mockDownload.mockClear();
  mockSendMessage.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const textArtifact: ArtifactPreview = {
  type: 'deep-research',
  label: 'Company Research',
  content: 'Meta builds technologies...',
  mimeType: 'text/plain',
  downloadUrl: null,
  storageKey: null,
  pdfStorageKey: null,
  sessionId: 'sess-123',
  filename: 'company-research.txt',
};

const pdfArtifact: ArtifactPreview = {
  type: 'cv',
  label: 'Resume',
  content: '{"basics":{}}', // JSON Resume
  mimeType: 'application/json',
  downloadUrl: null,
  storageKey: 'resume.json',
  pdfStorageKey: 'resume.pdf',
  sessionId: 'sess-123',
  filename: 'resume.pdf',
};

describe('ArtifactCard download', () => {
  it('downloads text artifact using inline content', async () => {
    render(<ArtifactCard artifact={textArtifact} defaultOpen={false} />);
    
    const downloadBtn = screen.getByTestId('artifact-card-download');
    fireEvent.click(downloadBtn);
    
    await waitFor(() => {
      expect(mockDownload).toHaveBeenCalledTimes(1);
    });
    
    const call = mockDownload.mock.calls[0][0];
    expect(call.filename).toBe('company-research.txt');
    expect(call.url).toMatch(/^blob:/);
  });

  it('downloads PDF artifact via ARTIFACT_FETCH_BLOB', async () => {
    mockSendMessage.mockResolvedValueOnce({
      ok: true,
      content: 'JVBERi0xLjQ=', // fake PDF base64
      mimeType: 'application/pdf',
    });
    
    render(<ArtifactCard artifact={pdfArtifact} defaultOpen={false} />);
    
    const downloadBtn = screen.getByTestId('artifact-card-download');
    fireEvent.click(downloadBtn);
    
    await waitFor(() => {
      expect(mockSendMessage).toHaveBeenCalledWith({
        key: 'ARTIFACT_FETCH_BLOB',
        data: { sessionId: 'sess-123', storageKey: 'resume.pdf' },
      });
    });
    
    await waitFor(() => {
      expect(mockDownload).toHaveBeenCalledTimes(1);
    });
  });

  it('shows loading state during download', async () => {
    // Make download take time
    mockDownload.mockImplementationOnce(() => new Promise((r) => setTimeout(r, 100)));
    
    render(<ArtifactCard artifact={textArtifact} defaultOpen={false} />);
    
    const downloadBtn = screen.getByTestId('artifact-card-download');
    fireEvent.click(downloadBtn);
    
    expect(downloadBtn).toHaveTextContent('Downloading...');
    expect(downloadBtn).toBeDisabled();
  });

  it('shows error state when download fails', async () => {
    mockDownload.mockRejectedValueOnce(new Error('Network error'));
    
    render(<ArtifactCard artifact={textArtifact} defaultOpen={false} />);
    
    const downloadBtn = screen.getByTestId('artifact-card-download');
    fireEvent.click(downloadBtn);
    
    await waitFor(() => {
      expect(downloadBtn).toHaveTextContent('Failed');
    });
  });
});
```

- [ ] **Step 2: Create test directory if needed**

```bash
mkdir -p tests/unit/sidepanel/artifacts
```

- [ ] **Step 3: Run tests**

```bash
pnpm test tests/unit/sidepanel/artifacts/ArtifactCard.spec.tsx
```

Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add tests/unit/sidepanel/artifacts/ArtifactCard.spec.tsx
git commit -m "test(sidepanel): add unit tests for ArtifactCard download"
```

---

## Phase 2: Meta Careers Autofill

### Task 4: Add metacareers.com to content script matches

**Files:**
- Modify: `entrypoints/ats.content/index.ts`

- [ ] **Step 1: Add metacareers.com to matches array**

In `entrypoints/ats.content/index.ts`, add the new match pattern:

```typescript
export default defineContentScript({
  matches: [
    'https://*.greenhouse.io/*',
    'https://jobs.lever.co/*',
    'https://*.myworkdayjobs.com/*',
    'https://*.metacareers.com/*',
    'https://www.metacareers.com/*',
    ...E2E_MATCHES,
  ],
  runAt: 'document_idle',
  // ... rest unchanged
});
```

- [ ] **Step 2: Verify the file compiles**

```bash
pnpm typecheck
```

Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add entrypoints/ats.content/index.ts
git commit -m "feat(content): add metacareers.com to content script matches"
```

---

### Task 5: Add metacareers to adapter-loader resolution

**Files:**
- Modify: `src/content/autofill/adapter-loader.ts`

- [ ] **Step 1: Add metacareers to resolveAtsKind function**

After the workday check, add:

```typescript
export function resolveAtsKind(url: string): AtsKind | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const host = parsed.host.toLowerCase();
  if (host === 'greenhouse.io' || host.endsWith('.greenhouse.io')) {
    return 'greenhouse';
  }
  if (host === 'jobs.lever.co' || host.endsWith('.jobs.lever.co')) {
    return 'lever';
  }
  if (host === 'myworkdayjobs.com' || host.endsWith('.myworkdayjobs.com')) {
    return 'workday';
  }
  // Meta Careers - no dedicated adapter, will use generic fill
  if (host === 'metacareers.com' || host.endsWith('.metacareers.com')) {
    return null; // Return null to trigger generic form filler
  }
  // Test fixture host...
  if (host === 'localhost:5174') {
    const path = parsed.pathname.toLowerCase();
    if (path.includes('/greenhouse')) return 'greenhouse';
    if (path.includes('/lever')) return 'lever';
    if (path.includes('/workday')) return 'workday';
  }
  return null;
}
```

Note: We return `null` for metacareers.com because the extension's `AutofillController.executeFill()` already falls back to `executeGenericFill()` when `adapter` is null. This uses `ats-autofill-engine/dom`'s `scanForm()` and `fillField()`.

- [ ] **Step 2: Verify the file compiles**

```bash
pnpm typecheck
```

Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/content/autofill/adapter-loader.ts
git commit -m "feat(autofill): add metacareers.com to URL matcher (uses generic fill)"
```

---

### Task 6: Run compliance and test manually

**Files:** None (testing only)

- [ ] **Step 1: Run full compliance check**

```bash
pnpm compliance
```

Expected: All checks pass

- [ ] **Step 2: Build the extension**

```bash
pnpm build
```

Expected: Build succeeds

- [ ] **Step 3: Test in browser**

1. Load the built extension in Chrome (chrome://extensions, Developer mode, Load unpacked from `.output/chrome-mv3`)
2. Navigate to a Meta Careers job application (e.g., the one you were on earlier)
3. Open the sidepanel
4. Verify the content script loaded (check devtools console for `[llmc-ext:content:ats] content script loaded`)
5. Click "Autofill application" and verify it attempts to fill fields

- [ ] **Step 4: Document any issues**

If generic fill doesn't work well with Meta's Comet framework, note specific failures for future dedicated adapter work.

---

### Task 7: Final commit and feature completion

- [ ] **Step 1: Run all tests**

```bash
pnpm test
```

Expected: All tests pass

- [ ] **Step 2: Verify no lint errors**

```bash
pnpm lint
```

Expected: No errors

- [ ] **Step 3: Update MEMORY.md with completion status**

Add entry noting:
- Artifact download fix complete
- Meta Careers generic autofill enabled
- Future work: dedicated Meta adapter if generic fill is insufficient

- [ ] **Step 4: Commit MEMORY.md update**

```bash
git add MEMORY.md
git commit -m "docs: update MEMORY.md with download fix and metacareers autofill status"
```

---

## Summary

| Task | Description | Status |
|------|-------------|--------|
| 1 | Add downloadBase64 helper | Pending |
| 2 | Update ArtifactCard download handler | Pending |
| 3 | Add unit tests for ArtifactCard | Pending |
| 4 | Add metacareers.com to content script | Pending |
| 5 | Add metacareers to adapter-loader | Pending |
| 6 | Run compliance and manual test | Pending |
| 7 | Final commit and documentation | Pending |

**Total estimated time:** 45-60 minutes

**Branch:** `feature/artifact-download-metacareers-autofill`
