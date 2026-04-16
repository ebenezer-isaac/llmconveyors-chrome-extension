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
      <ArtifactCard artifact={baseArtifact({ type: 'cv', content: '{}' })} />,
    );
    expect(screen.queryByTestId('artifact-body-cv')).toBeTruthy();
    rerender(
      <ArtifactCard
        artifact={baseArtifact({
          type: 'ats-comparison',
          payload: { before: { score: 10 }, after: { score: 20 } },
          content: null,
          downloadUrl: 'https://x/y.json',
        })}
      />,
    );
    expect(screen.queryByTestId('artifact-body-ats')).toBeTruthy();
    rerender(
      <ArtifactCard
        artifact={baseArtifact({ type: 'cold-email', content: 'Subject: Hi\n\nHello' })}
      />,
    );
    expect(screen.queryByTestId('artifact-body-cold-email')).toBeTruthy();
  });
});
