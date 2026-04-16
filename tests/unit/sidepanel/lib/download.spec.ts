// SPDX-License-Identifier: MIT
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { downloadUrl, downloadBlob } from '@/entrypoints/sidepanel/lib/download';

type FakeDownloads = {
  download: ReturnType<typeof vi.fn>;
};

function mountDownloads(impl?: (opts: unknown) => Promise<number> | number | void): FakeDownloads {
  const download = vi.fn(async (opts: unknown) => {
    if (typeof impl === 'function') {
      const out = impl(opts);
      if (out instanceof Promise) return out;
      return out ?? 1;
    }
    return 1;
  });
  (globalThis as unknown as { chrome: { downloads: FakeDownloads } }).chrome = {
    downloads: { download },
  };
  return { download };
}

function unmountDownloads(): void {
  delete (globalThis as { chrome?: unknown }).chrome;
}

describe('sidepanel download helper', () => {
  beforeEach(() => {
    unmountDownloads();
  });

  describe('downloadUrl', () => {
    it('dispatches chrome.downloads.download with url + filename for a remote URL', async () => {
      const fake = mountDownloads();
      const ok = await downloadUrl('https://api.llmconveyors.com/a.pdf', 'Resume.pdf');
      expect(ok).toBe(true);
      expect(fake.download).toHaveBeenCalledWith({
        url: 'https://api.llmconveyors.com/a.pdf',
        filename: 'Resume.pdf',
        saveAs: false,
      });
    });

    it('forwards saveAs when caller requests it', async () => {
      const fake = mountDownloads();
      await downloadUrl('https://x/y.pdf', 'y.pdf', { saveAs: true });
      expect(fake.download).toHaveBeenCalledWith(
        expect.objectContaining({ saveAs: true }),
      );
    });

    it('returns false when chrome.downloads is unavailable', async () => {
      const ok = await downloadUrl('https://x/y.pdf', 'y.pdf');
      expect(ok).toBe(false);
    });

    it('returns false when the downloads API rejects', async () => {
      mountDownloads(() => {
        throw new Error('user cancelled');
      });
      const ok = await downloadUrl('https://x/y.pdf', 'y.pdf');
      expect(ok).toBe(false);
    });
  });

  describe('downloadBlob', () => {
    it('wraps content in a blob URL and dispatches chrome.downloads.download', async () => {
      const fake = mountDownloads();
      const originalCreate = URL.createObjectURL;
      const originalRevoke = URL.revokeObjectURL;
      const createSpy = vi.fn(() => 'blob:fake-url');
      const revokeSpy = vi.fn();
      URL.createObjectURL = createSpy as unknown as typeof URL.createObjectURL;
      URL.revokeObjectURL = revokeSpy as unknown as typeof URL.revokeObjectURL;
      try {
        const ok = await downloadBlob('hello world', 'greeting.txt', 'text/plain');
        expect(ok).toBe(true);
        expect(createSpy).toHaveBeenCalledTimes(1);
        const call = createSpy.mock.calls[0] as unknown as [Blob] | undefined;
        expect(call?.[0]).toBeInstanceOf(Blob);
        expect(fake.download).toHaveBeenCalledWith({
          url: 'blob:fake-url',
          filename: 'greeting.txt',
          saveAs: false,
        });
      } finally {
        URL.createObjectURL = originalCreate;
        URL.revokeObjectURL = originalRevoke;
      }
    });

    it('returns false when chrome.downloads is unavailable', async () => {
      const ok = await downloadBlob('hello', 'x.txt', 'text/plain');
      expect(ok).toBe(false);
    });

    it('returns false when the download call throws', async () => {
      mountDownloads(() => {
        throw new Error('nope');
      });
      const ok = await downloadBlob('hello', 'x.txt', 'text/plain');
      expect(ok).toBe(false);
    });
  });
});
