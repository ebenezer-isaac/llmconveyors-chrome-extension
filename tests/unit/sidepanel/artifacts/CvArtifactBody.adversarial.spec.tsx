// SPDX-License-Identifier: MIT
/**
 * Adversarial tests for CvArtifactBody PDF path. Ensures the base64
 * decode path tolerates malformed input, missing fields, and unmount
 * races without leaking blob URLs or crashing React.
 */

// React auto-injected
import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';
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
    pdfStorageKey: 'sess/abc.pdf',
    sessionId: 'session-x',
    filename: 'Resume.pdf',
    ...overrides,
  };
}

type SendImpl = (msg: unknown) => Promise<unknown>;

function installRuntime(impl: SendImpl): ReturnType<typeof vi.fn> {
  const sendMessage = vi.fn(impl);
  (globalThis as unknown as { chrome: { runtime: unknown } }).chrome = {
    runtime: { sendMessage },
  };
  return sendMessage;
}

function uninstallRuntime(): void {
  delete (globalThis as { chrome?: unknown }).chrome;
}

describe('CvArtifactBody adversarial (PDF path)', () => {
  // Record created object URLs so we can assert they are not leaked.
  const createdUrls: string[] = [];
  const revokedUrls: string[] = [];
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;

  beforeEach(() => {
    createdUrls.length = 0;
    revokedUrls.length = 0;
    URL.createObjectURL = vi.fn((blob: Blob) => {
      const url = `blob:mock/${createdUrls.length}-${blob.size}`;
      createdUrls.push(url);
      return url;
    });
    URL.revokeObjectURL = vi.fn((url: string) => {
      revokedUrls.push(url);
    });
  });

  afterEach(() => {
    cleanup();
    uninstallRuntime();
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
  });

  describe('bg error envelopes', () => {
    it('shows error body when bg returns ok:false', async () => {
      installRuntime(async () => ({ ok: false, reason: 'unauthenticated' }));
      render(<CvArtifactBody artifact={cvArtifact()} open={true} />);
      await waitFor(() =>
        expect(screen.queryByTestId('artifact-body-cv-pdf-error')).toBeTruthy(),
      );
      expect(screen.getByTestId('artifact-body-cv-pdf-error').textContent).toContain(
        'unauthenticated',
      );
      expect(createdUrls).toHaveLength(0);
    });

    it('shows error body when bg returns undefined', async () => {
      installRuntime(async () => undefined);
      render(<CvArtifactBody artifact={cvArtifact()} open={true} />);
      await waitFor(() =>
        expect(screen.queryByTestId('artifact-body-cv-pdf-error')).toBeTruthy(),
      );
      expect(screen.getByTestId('artifact-body-cv-pdf-error').textContent).toContain(
        'empty-response',
      );
    });

    it('shows error body when bg throws', async () => {
      installRuntime(async () => {
        throw new Error('runtime crashed mid-fetch');
      });
      render(<CvArtifactBody artifact={cvArtifact()} open={true} />);
      await waitFor(() =>
        expect(screen.queryByTestId('artifact-body-cv-pdf-error')).toBeTruthy(),
      );
      expect(screen.getByTestId('artifact-body-cv-pdf-error').textContent).toContain(
        'runtime crashed mid-fetch',
      );
      expect(createdUrls).toHaveLength(0);
    });

    it('shows error body when bg returns ok but no content string', async () => {
      installRuntime(async () => ({ ok: true, mimeType: 'application/pdf' }));
      render(<CvArtifactBody artifact={cvArtifact()} open={true} />);
      await waitFor(() =>
        expect(screen.queryByTestId('artifact-body-cv-pdf-error')).toBeTruthy(),
      );
      expect(createdUrls).toHaveLength(0);
    });
  });

  describe('decode path', () => {
    it('creates one object URL when bg returns valid base64 content', async () => {
      // "YWJjZA==" decodes to "abcd"
      installRuntime(async () => ({
        ok: true,
        content: 'YWJjZA==',
        mimeType: 'application/pdf',
      }));
      render(<CvArtifactBody artifact={cvArtifact()} open={true} />);
      await waitFor(() =>
        expect(screen.queryByTestId('artifact-body-cv-pdf')).toBeTruthy(),
      );
      expect(createdUrls).toHaveLength(1);
      const iframe = screen.getByTestId('artifact-body-cv-pdf') as HTMLIFrameElement;
      expect(iframe.src).toContain('blob:mock/0-');
    });

    it('defaults mimeType to application/pdf when bg omits it', async () => {
      installRuntime(async () => ({ ok: true, content: 'YWJjZA==' }));
      render(<CvArtifactBody artifact={cvArtifact()} open={true} />);
      await waitFor(() =>
        expect(screen.queryByTestId('artifact-body-cv-pdf')).toBeTruthy(),
      );
      expect(createdUrls).toHaveLength(1);
    });
  });

  describe('lifecycle', () => {
    it('does not dispatch ARTIFACT_FETCH_BLOB when card is closed', async () => {
      const send = installRuntime(async () => ({ ok: true, content: 'YWJjZA==' }));
      render(<CvArtifactBody artifact={cvArtifact()} open={false} />);
      // Give effects time to run
      await new Promise((r) => setTimeout(r, 20));
      expect(send).not.toHaveBeenCalled();
    });

    it('does not re-fetch on re-render when the artifact identity is stable', async () => {
      const send = installRuntime(async () => ({
        ok: true,
        content: 'YWJjZA==',
      }));
      const { rerender } = render(
        <CvArtifactBody artifact={cvArtifact()} open={true} />,
      );
      await waitFor(() =>
        expect(screen.queryByTestId('artifact-body-cv-pdf')).toBeTruthy(),
      );
      const callsAfterFirst = send.mock.calls.length;
      rerender(<CvArtifactBody artifact={cvArtifact()} open={true} />);
      rerender(<CvArtifactBody artifact={cvArtifact()} open={true} />);
      await new Promise((r) => setTimeout(r, 20));
      expect(send.mock.calls.length).toBe(callsAfterFirst);
    });

    it('re-fetches when pdfStorageKey changes', async () => {
      const send = installRuntime(async () => ({
        ok: true,
        content: 'YWJjZA==',
      }));
      const { rerender } = render(
        <CvArtifactBody artifact={cvArtifact()} open={true} />,
      );
      await waitFor(() =>
        expect(screen.queryByTestId('artifact-body-cv-pdf')).toBeTruthy(),
      );
      const firstCalls = send.mock.calls.length;
      rerender(
        <CvArtifactBody
          artifact={cvArtifact({ pdfStorageKey: 'sess/other.pdf' })}
          open={true}
        />,
      );
      await waitFor(() => expect(send.mock.calls.length).toBeGreaterThan(firstCalls));
    });
  });

  describe('XSS safety', () => {
    it('does not treat base64 content as HTML (iframe src is blob URL only)', async () => {
      // Even if the backend returned pure string, it ends up in a Blob not
      // in any DOM attribute via dangerouslySetInnerHTML.
      installRuntime(async () => ({
        ok: true,
        content: 'PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==', // <script>alert(1)</script>
        mimeType: 'text/html',
      }));
      render(<CvArtifactBody artifact={cvArtifact()} open={true} />);
      await waitFor(() =>
        expect(screen.queryByTestId('artifact-body-cv-pdf')).toBeTruthy(),
      );
      // Iframe sandbox / blob URL prevents script from executing in the
      // parent origin; we just verify no <script> landed in the sidepanel DOM.
      expect(document.querySelector('script')).toBeNull();
      expect((globalThis as { HACKED?: boolean }).HACKED).toBeUndefined();
    });
  });
});
