// SPDX-License-Identifier: MIT
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, screen, cleanup } from '@testing-library/react';
import { ArtifactCard } from '@/entrypoints/sidepanel/artifacts/ArtifactCard';
import type { ArtifactPreview } from '@/src/background/messaging/schemas/artifact-preview.schema';

function baseArtifact(overrides?: Partial<ArtifactPreview>): ArtifactPreview {
  return {
    type: 'cover-letter',
    label: 'Cover Letter',
    content: 'Hello, world!',
    mimeType: 'text/plain',
    downloadUrl: null,
    storageKey: null,
    pdfStorageKey: null,
    sessionId: null,
    filename: 'Cover_Letter.txt',
    ...overrides,
  };
}

function mountChrome(): ReturnType<typeof vi.fn> {
  const downloadFn = vi.fn(async () => 1);
  (globalThis as unknown as { chrome: { downloads: { download: unknown } } }).chrome = {
    downloads: { download: downloadFn },
  };
  return downloadFn;
}

function unmountChrome(): void {
  delete (globalThis as { chrome?: unknown }).chrome;
}

describe('ArtifactCard', () => {
  beforeEach(unmountChrome);
  afterEach(() => {
    cleanup();
    unmountChrome();
  });

  it('toggles open/closed on header click and updates data-open', () => {
    render(<ArtifactCard artifact={baseArtifact()} />);
    const card = screen.getByTestId('artifact-card');
    expect(card.getAttribute('data-open')).toBe('false');
    fireEvent.click(screen.getByTestId('artifact-card-toggle'));
    expect(card.getAttribute('data-open')).toBe('true');
    fireEvent.click(screen.getByTestId('artifact-card-toggle'));
    expect(card.getAttribute('data-open')).toBe('false');
  });

  it('respects defaultOpen=true', () => {
    render(<ArtifactCard artifact={baseArtifact()} defaultOpen />);
    expect(screen.getByTestId('artifact-card').getAttribute('data-open')).toBe(
      'true',
    );
  });

  it('dispatches chrome.downloads.download when the download button is clicked (URL path)', async () => {
    const downloadFn = mountChrome();
    const artifact = baseArtifact({
      downloadUrl: 'https://api.llmconveyors.com/a.pdf',
    });
    render(<ArtifactCard artifact={artifact} />);
    fireEvent.click(screen.getByTestId('artifact-card-download'));
    // downloadUrl prefers the URL path, not a blob
    await vi.waitFor(() => {
      expect(downloadFn).toHaveBeenCalledWith({
        url: 'https://api.llmconveyors.com/a.pdf',
        filename: 'Cover_Letter.txt',
        saveAs: false,
      });
    });
  });

  it('falls back to blob download when only content is available', async () => {
    const downloadFn = mountChrome();
    const originalCreate = URL.createObjectURL;
    URL.createObjectURL = (() => 'blob:fake') as unknown as typeof URL.createObjectURL;
    try {
      render(<ArtifactCard artifact={baseArtifact()} />);
      fireEvent.click(screen.getByTestId('artifact-card-download'));
      await vi.waitFor(() => {
        expect(downloadFn).toHaveBeenCalledWith({
          url: 'blob:fake',
          filename: 'Cover_Letter.txt',
          saveAs: false,
        });
      });
    } finally {
      URL.createObjectURL = originalCreate;
    }
  });

  it('copies content to clipboard and flips button label to "Copied"', async () => {
    const writeText = vi.fn(async () => undefined);
    (globalThis as unknown as {
      navigator: { clipboard: { writeText: unknown } };
    }).navigator = { clipboard: { writeText } };
    try {
      render(<ArtifactCard artifact={baseArtifact()} />);
      fireEvent.click(screen.getByTestId('artifact-card-copy'));
      await vi.waitFor(() => {
        expect(writeText).toHaveBeenCalledWith('Hello, world!');
      });
      await vi.waitFor(() => {
        expect(screen.getByTestId('artifact-card-copy').textContent).toBe('Copied');
      });
    } finally {
      // restore
    }
  });

  it('hides the copy button when the artifact has no inline content', () => {
    render(
      <ArtifactCard
        artifact={baseArtifact({
          content: null,
          downloadUrl: 'https://api.llmconveyors.com/a.pdf',
        })}
      />,
    );
    expect(screen.queryByTestId('artifact-card-copy')).toBeNull();
    expect(screen.getByTestId('artifact-card-download')).toBeTruthy();
  });

  it('picks the right body for each known type', () => {
    const { rerender } = render(
      <ArtifactCard artifact={baseArtifact({ type: 'cv', content: '{}' })} defaultOpen />,
    );
    expect(screen.queryByTestId('artifact-body-cv')).toBeTruthy();
    rerender(
      <ArtifactCard
        artifact={baseArtifact({
          type: 'ats-comparison',
          payload: {
            // Production AtsComparisonPayload shape: overallScore + grade
            // + matchedKeywords + missingKeywords (see AtsScoreResultSchema
            // in libs/shared-types). The extension body mirrors the
            // web's AtsComparisonCard so it requires the full shape.
            before: {
              overallScore: 60,
              grade: 'C',
              matchedKeywords: [],
              missingKeywords: ['python'],
            },
            after: {
              overallScore: 85,
              grade: 'B',
              matchedKeywords: [{ keyword: 'python' }],
              missingKeywords: [],
            },
            improvement: 25,
          },
          content: null,
          downloadUrl: 'https://x/y.json',
        })}
        defaultOpen
      />,
    );
    expect(screen.queryByTestId('artifact-body-ats')).toBeTruthy();
    rerender(
      <ArtifactCard
        artifact={baseArtifact({ type: 'cold-email', content: 'Subject: Hi\n\nHello' })}
        defaultOpen
      />,
    );
    expect(screen.queryByTestId('artifact-body-cold-email')).toBeTruthy();
  });

  it('does not mount the body while the card is collapsed', () => {
    render(<ArtifactCard artifact={baseArtifact()} />);
    expect(screen.queryByTestId('artifact-card-body')).toBeNull();
  });

  it('mounts the body on expand and hides it again on collapse', () => {
    render(<ArtifactCard artifact={baseArtifact()} />);
    fireEvent.click(screen.getByTestId('artifact-card-toggle'));
    expect(screen.getByTestId('artifact-card-body')).toBeTruthy();
    fireEvent.click(screen.getByTestId('artifact-card-toggle'));
    expect(screen.queryByTestId('artifact-card-body')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Download-specific scenarios (task requirement)
// ---------------------------------------------------------------------------

function mountChromeWithRuntime(opts: {
  downloadImpl?: () => Promise<number>;
  sendMessageImpl?: (msg: unknown) => Promise<unknown>;
}): { downloadFn: ReturnType<typeof vi.fn>; sendMessageFn: ReturnType<typeof vi.fn> } {
  const downloadFn = vi.fn(opts.downloadImpl ?? (async () => 1));
  const sendMessageFn = vi.fn(opts.sendMessageImpl ?? (async () => undefined));
  (
    globalThis as unknown as {
      chrome: {
        downloads: { download: unknown };
        runtime: { sendMessage: unknown };
      };
    }
  ).chrome = {
    downloads: { download: downloadFn },
    runtime: { sendMessage: sendMessageFn },
  };
  return { downloadFn, sendMessageFn };
}

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
  content: '{"basics":{}}',
  mimeType: 'application/json',
  downloadUrl: null,
  storageKey: 'resume.json',
  pdfStorageKey: 'resume.pdf',
  sessionId: 'sess-123',
  filename: 'resume.pdf',
};

describe('ArtifactCard download', () => {
  let originalCreateObjectURL: typeof URL.createObjectURL;

  beforeEach(() => {
    unmountChrome();
    originalCreateObjectURL = URL.createObjectURL;
    URL.createObjectURL = (() => 'blob:fake') as unknown as typeof URL.createObjectURL;
  });

  afterEach(() => {
    cleanup();
    unmountChrome();
    URL.createObjectURL = originalCreateObjectURL;
  });

  it('downloads text artifact using inline content (blob URL)', async () => {
    const { downloadFn } = mountChromeWithRuntime({});

    render(<ArtifactCard artifact={textArtifact} />);

    fireEvent.click(screen.getByTestId('artifact-card-download'));

    await vi.waitFor(() => {
      expect(downloadFn).toHaveBeenCalledTimes(1);
    });

    const call = downloadFn.mock.calls[0]?.[0] as { url: string; filename: string } | undefined;
    expect(call).toBeDefined();
    expect(call!.filename).toBe('company-research.txt');
    // Inline-content path uses downloadBlob, which wraps in a blob URL
    expect(call!.url).toBe('blob:fake');
  });

  it('downloads PDF artifact via ARTIFACT_FETCH_BLOB (pdfStorageKey)', async () => {
    const { downloadFn, sendMessageFn } = mountChromeWithRuntime({
      sendMessageImpl: async () => ({
        ok: true,
        content: 'JVBERi0xLjQ=', // fake base64 PDF bytes
        mimeType: 'application/pdf',
      }),
    });

    render(<ArtifactCard artifact={pdfArtifact} />);

    fireEvent.click(screen.getByTestId('artifact-card-download'));

    await vi.waitFor(() => {
      expect(sendMessageFn).toHaveBeenCalledWith({
        key: 'ARTIFACT_FETCH_BLOB',
        data: { sessionId: 'sess-123', storageKey: 'resume.pdf' },
      });
    });

    await vi.waitFor(() => {
      expect(downloadFn).toHaveBeenCalledTimes(1);
    });

    const call = downloadFn.mock.calls[0]?.[0] as { url: string; filename: string } | undefined;
    expect(call).toBeDefined();
    expect(call!.filename).toBe('resume.pdf');
    expect(call!.url).toBe('blob:fake');
  });

  it('shows loading state during download', async () => {
    let resolveDownload!: (v: number) => void;
    mountChromeWithRuntime({
      downloadImpl: () =>
        new Promise<number>((res) => {
          resolveDownload = res;
        }),
    });

    render(<ArtifactCard artifact={textArtifact} />);

    const btn = screen.getByTestId('artifact-card-download');
    fireEvent.click(btn);

    // Button should immediately show loading state and be disabled
    expect(btn.textContent).toBe('Downloading...');
    expect((btn as HTMLButtonElement).disabled).toBe(true);

    // Resolve so the component can settle (avoids act() warnings)
    resolveDownload(1);
    await vi.waitFor(() => {
      expect(btn.textContent).not.toBe('Downloading...');
    });
  });

  it('shows error state when download fails', async () => {
    mountChromeWithRuntime({
      downloadImpl: async () => {
        throw new Error('Network error');
      },
    });

    render(<ArtifactCard artifact={textArtifact} />);

    const btn = screen.getByTestId('artifact-card-download');
    fireEvent.click(btn);

    await vi.waitFor(() => {
      expect(btn.textContent).toBe('Failed');
    });
  });

  it('ignores concurrent download clicks (re-entry guard)', async () => {
    let resolveFirst!: (v: number) => void;
    const { downloadFn } = mountChromeWithRuntime({
      downloadImpl: () =>
        new Promise<number>((res) => {
          resolveFirst = res;
        }),
    });

    render(<ArtifactCard artifact={textArtifact} />);

    const btn = screen.getByTestId('artifact-card-download');

    // First click starts the download
    fireEvent.click(btn);
    // Button is now disabled -- second click must be a no-op
    fireEvent.click(btn);

    // Resolve the first download
    resolveFirst(1);
    await vi.waitFor(() => {
      expect(btn.textContent).not.toBe('Downloading...');
    });

    // Only one call despite two clicks
    expect(downloadFn).toHaveBeenCalledTimes(1);
  });

  it('falls back to storageKey fetch when pdfStorageKey fetch fails', async () => {
    // Artifact with no inline content so Priority 3 (content) is skipped and
    // Priority 4 (storageKey via ARTIFACT_FETCH_BLOB) is reached after pdfStorageKey fails.
    const noContentPdfArtifact: ArtifactPreview = {
      type: 'cv',
      label: 'Resume',
      content: null,
      mimeType: null,
      downloadUrl: null,
      storageKey: 'resume.json',
      pdfStorageKey: 'resume.pdf',
      sessionId: 'sess-123',
      filename: 'resume.pdf',
    };

    let callCount = 0;
    const { downloadFn, sendMessageFn } = mountChromeWithRuntime({
      sendMessageImpl: async (msg: unknown) => {
        if (typeof msg !== 'object' || msg === null) {
          return { ok: false, reason: 'invalid' };
        }
        callCount += 1;
        const m = msg as { key?: string; data?: { storageKey?: string } };
        if (m?.data?.storageKey === 'resume.pdf') {
          // pdfStorageKey fetch fails -- fall through to storageKey
          return { ok: false, reason: 'not-found' };
        }
        // storageKey fallback succeeds with JSON content
        return {
          ok: true,
          content: '{"basics":{}}',
          mimeType: 'application/json',
        };
      },
    });

    render(<ArtifactCard artifact={noContentPdfArtifact} />);

    fireEvent.click(screen.getByTestId('artifact-card-download'));

    // Both ARTIFACT_FETCH_BLOB calls (pdfStorageKey then storageKey) must have been made
    await vi.waitFor(() => {
      expect(callCount).toBeGreaterThanOrEqual(2);
    });

    // The storageKey fallback path triggers a download
    await vi.waitFor(() => {
      expect(downloadFn).toHaveBeenCalledTimes(1);
    });

    // Verify the second call targeted the JSON storageKey
    const calls = sendMessageFn.mock.calls as Array<
      [{ key: string; data: { storageKey: string } }]
    >;
    const fallbackCall = calls.find((c) => c[0]?.data?.storageKey === 'resume.json');
    expect(fallbackCall).toBeDefined();
  });
});
