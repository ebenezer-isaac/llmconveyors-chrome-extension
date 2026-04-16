// SPDX-License-Identifier: MIT
import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { CvArtifactBody } from '@/entrypoints/sidepanel/artifacts/CvArtifactBody';
import type { ArtifactPreview } from '@/src/background/messaging/schemas/artifact-preview.schema';

function cvArtifact(overrides?: Partial<ArtifactPreview>): ArtifactPreview {
  return {
    type: 'cv',
    label: 'Resume',
    content: null,
    mimeType: 'application/pdf',
    downloadUrl: null,
    storageKey: null,
    pdfStorageKey: null,
    sessionId: null,
    filename: 'Resume.pdf',
    ...overrides,
  };
}

function mountRuntime(
  response: unknown | Error,
): ReturnType<typeof vi.fn> {
  const sendMessage = vi.fn(async () => {
    if (response instanceof Error) throw response;
    return response;
  });
  (globalThis as unknown as { chrome: { runtime: unknown } }).chrome = {
    runtime: { sendMessage },
  };
  return sendMessage;
}

function unmountRuntime(): void {
  delete (globalThis as { chrome?: unknown }).chrome;
}

describe('CvArtifactBody', () => {
  afterEach(() => {
    cleanup();
    unmountRuntime();
  });

  it('renders the JSON Resume summary when no PDF storage key is present', () => {
    const artifact = cvArtifact({
      content: JSON.stringify({
        basics: { name: 'Jane Doe', email: 'jane@example.com' },
        work: [{ company: 'Meta', position: 'Staff SWE' }],
      }),
    });
    render(<CvArtifactBody artifact={artifact} open={true} />);
    expect(screen.getByTestId('artifact-body-cv')).toBeTruthy();
    expect(screen.getByTestId('artifact-body-cv').textContent).toContain('Jane Doe');
    expect(screen.getByTestId('artifact-body-cv').textContent).toContain('Meta');
  });

  it('renders the unparseable fallback when content is not JSON Resume', () => {
    render(
      <CvArtifactBody
        artifact={cvArtifact({ content: 'not-json' })}
        open={true}
      />,
    );
    expect(screen.getByTestId('artifact-body-cv-unparseable')).toBeTruthy();
  });

  it('fetches the PDF via ARTIFACT_FETCH_BLOB and renders it in an iframe when opened', async () => {
    // The base64 below decodes to plain text "abcd"; the body component
    // passes it to a Blob so the content does not have to be valid PDF
    // for the test to assert the iframe wiring.
    const sendMessage = mountRuntime({
      ok: true,
      content: 'YWJjZA==',
      mimeType: 'application/pdf',
    });

    const artifact = cvArtifact({
      pdfStorageKey: 'users/u/sessions/s/cv.pdf',
      sessionId: 'sess-1',
    });

    const originalCreate = URL.createObjectURL;
    URL.createObjectURL = (() => 'blob:fake-pdf') as unknown as typeof URL.createObjectURL;

    try {
      render(<CvArtifactBody artifact={artifact} open={true} />);
      await waitFor(() => {
        const iframe = screen.getByTestId('artifact-body-cv-pdf') as HTMLIFrameElement;
        expect(iframe).toBeTruthy();
        expect(iframe.getAttribute('src')).toBe('blob:fake-pdf');
      });
      expect(sendMessage).toHaveBeenCalledWith({
        key: 'ARTIFACT_FETCH_BLOB',
        data: {
          sessionId: 'sess-1',
          storageKey: 'users/u/sessions/s/cv.pdf',
        },
      });
    } finally {
      URL.createObjectURL = originalCreate;
    }
  });

  it('surfaces an error message when the blob fetch fails', async () => {
    mountRuntime({ ok: false, reason: 'not-found' });
    const artifact = cvArtifact({
      pdfStorageKey: 'users/u/sessions/s/cv.pdf',
      sessionId: 'sess-1',
    });

    render(<CvArtifactBody artifact={artifact} open={true} />);
    await waitFor(() => {
      expect(screen.getByTestId('artifact-body-cv-pdf-error')).toBeTruthy();
    });
    expect(screen.getByTestId('artifact-body-cv-pdf-error').textContent).toContain(
      'not-found',
    );
  });

  it('does not dispatch the blob fetch until the card is opened', () => {
    const sendMessage = mountRuntime({ ok: true, content: 'YQ==', mimeType: 'application/pdf' });
    const artifact = cvArtifact({
      pdfStorageKey: 'users/u/sessions/s/cv.pdf',
      sessionId: 'sess-1',
    });
    render(<CvArtifactBody artifact={artifact} open={false} />);
    expect(sendMessage).not.toHaveBeenCalled();
    expect(screen.queryByTestId('artifact-body-cv-pdf')).toBeNull();
  });
});
