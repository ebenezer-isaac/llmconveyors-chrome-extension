// SPDX-License-Identifier: MIT
import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { TextArtifactBody } from '@/entrypoints/sidepanel/artifacts/TextArtifactBody';
import type { ArtifactPreview } from '@/src/background/messaging/schemas/artifact-preview.schema';

function base(overrides?: Partial<ArtifactPreview>): ArtifactPreview {
  return {
    type: 'cover-letter',
    label: 'Cover Letter',
    content: null,
    mimeType: null,
    downloadUrl: null,
    storageKey: null,
    pdfStorageKey: null,
    sessionId: null,
    filename: 'Cover_Letter.txt',
    ...overrides,
  };
}

function mountRuntime(response: unknown | Error): ReturnType<typeof vi.fn> {
  const sendMessage = vi.fn(async () => {
    if (response instanceof Error) throw response;
    return response;
  });
  (globalThis as unknown as { chrome: { runtime: unknown } }).chrome = {
    runtime: { sendMessage },
  };
  return sendMessage;
}

function unmount(): void {
  delete (globalThis as { chrome?: unknown }).chrome;
}

describe('TextArtifactBody', () => {
  afterEach(() => {
    cleanup();
    unmount();
  });

  it('renders markdown when content is already inline', () => {
    render(
      <TextArtifactBody
        artifact={base({ content: '# Hello\n\nworld' })}
        open={true}
      />,
    );
    expect(screen.getByTestId('artifact-body-text')).toBeTruthy();
  });

  it('lazy-fetches content via ARTIFACT_FETCH_BLOB when only storageKey is present', async () => {
    const sendMessage = mountRuntime({
      ok: true,
      content: '# Research\n\nA company.',
      mimeType: 'text/markdown',
    });
    render(
      <TextArtifactBody
        artifact={base({
          type: 'deep-research',
          storageKey: 'users/u/sessions/s/research.md',
          sessionId: 'sess-1',
        })}
        open={true}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('artifact-body-text')).toBeTruthy();
    });
    expect(sendMessage).toHaveBeenCalledWith({
      key: 'ARTIFACT_FETCH_BLOB',
      data: {
        sessionId: 'sess-1',
        storageKey: 'users/u/sessions/s/research.md',
      },
    });
  });

  it('surfaces a spinner while the lazy fetch is in flight', async () => {
    // Never-resolving sendMessage keeps state in "loading".
    (globalThis as unknown as { chrome: { runtime: unknown } }).chrome = {
      runtime: { sendMessage: () => new Promise(() => undefined) },
    };
    render(
      <TextArtifactBody
        artifact={base({
          type: 'deep-research',
          storageKey: 'users/u/sessions/s/research.md',
          sessionId: 'sess-1',
        })}
        open={true}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('artifact-body-loading')).toBeTruthy();
    });
  });

  it('shows an error surface when the fetch resolves with ok:false', async () => {
    mountRuntime({ ok: false, reason: 'not-found' });
    render(
      <TextArtifactBody
        artifact={base({
          type: 'deep-research',
          storageKey: 'users/u/sessions/s/research.md',
          sessionId: 'sess-1',
        })}
        open={true}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('artifact-body-error')).toBeTruthy();
    });
  });

  it('renders the empty state only when there is neither content nor a fetchable key', () => {
    render(<TextArtifactBody artifact={base()} open={true} />);
    expect(screen.getByTestId('artifact-body-empty')).toBeTruthy();
  });

  it('does not dispatch the fetch when the card is closed', () => {
    const sendMessage = mountRuntime({
      ok: true,
      content: 'x',
      mimeType: 'text/plain',
    });
    render(
      <TextArtifactBody
        artifact={base({
          type: 'deep-research',
          storageKey: 'users/u/sessions/s/research.md',
          sessionId: 'sess-1',
        })}
        open={false}
      />,
    );
    expect(sendMessage).not.toHaveBeenCalled();
  });
});
