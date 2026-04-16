// SPDX-License-Identifier: MIT
/**
 * Wraps chrome.downloads.download so sidepanel / popup components can
 * save artifact files reliably.
 *
 * Background: the previous implementation used `<a download>` with a
 * blob URL, which works only for same-origin in-memory content. When the
 * href was a signed backend URL (SessionArtifact.downloadUrl) Chrome
 * ignored the `download` attribute for cross-origin responses and
 * opened the URL in a new tab, where the JSON body rendered as plain
 * text. chrome.downloads.download honours both URL shapes and the
 * filename hint regardless of origin.
 *
 * The `downloads` permission is declared in wxt.config.ts.
 */

import { createLogger } from '@/src/background/log';

const log = createLogger('sidepanel.download');

type DownloadOptions = { url: string; filename: string; saveAs?: boolean };

type DownloadsApi = {
  download: (opts: DownloadOptions) => Promise<number>;
};

function getDownloads(): DownloadsApi | null {
  const g = globalThis as unknown as {
    chrome?: { downloads?: DownloadsApi };
    browser?: { downloads?: DownloadsApi };
  };
  return g.chrome?.downloads ?? g.browser?.downloads ?? null;
}

/**
 * Save a remote URL (signed backend link) to disk under `filename`.
 * Returns true on success, false when the downloads API is unavailable
 * or the call rejects.
 */
export async function downloadUrl(
  url: string,
  filename: string,
  opts: { saveAs?: boolean } = {},
): Promise<boolean> {
  const api = getDownloads();
  if (api === null) {
    log.warn('chrome.downloads unavailable', { filename });
    return false;
  }
  try {
    await api.download({ url, filename, saveAs: opts.saveAs === true });
    return true;
  } catch (err: unknown) {
    log.warn('downloadUrl failed', {
      filename,
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

/**
 * Save an in-memory content string as a file. Wraps the content in a
 * Blob and hands the blob URL to chrome.downloads so the browser
 * triggers a real save dialog rather than opening the URL inline.
 * Revokes the blob URL after the download completes.
 */
export async function downloadBlob(
  content: string,
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
    const blob = new Blob([content], { type: mimeType });
    blobUrl = URL.createObjectURL(blob);
    await api.download({ url: blobUrl, filename, saveAs: opts.saveAs === true });
    return true;
  } catch (err: unknown) {
    log.warn('downloadBlob failed', {
      filename,
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  } finally {
    if (blobUrl !== null) {
      // Revoke after a grace period so the download pipeline finishes
      // reading the blob; 30s is generous for any realistic artifact.
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
