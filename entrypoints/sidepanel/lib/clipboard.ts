// SPDX-License-Identifier: MIT
/**
 * copyToClipboard -- prefer the Async Clipboard API, fall back to a
 * transient textarea + document.execCommand for insecure contexts or
 * older browsers. Returns true when the write succeeded.
 *
 * Mirrors the web dashboard helper at
 * e:/llmconveyors.com/src/lib/clipboard.ts so both surfaces behave the
 * same on copy (especially important for cover letter / cold email
 * artifact cards where the user expects the full text in their
 * clipboard).
 */

export async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof text !== 'string' || text.length === 0) return false;
  const g = globalThis as unknown as {
    navigator?: {
      clipboard?: { writeText: (s: string) => Promise<void> };
    };
  };
  const writeText = g.navigator?.clipboard?.writeText;
  if (typeof writeText === 'function') {
    try {
      await writeText.call(g.navigator?.clipboard, text);
      return true;
    } catch {
      // fall through to execCommand path
    }
  }
  try {
    const doc = (globalThis as unknown as { document?: Document }).document;
    if (!doc) return false;
    const textarea = doc.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    doc.body.appendChild(textarea);
    textarea.select();
    const ok = doc.execCommand('copy');
    doc.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}
