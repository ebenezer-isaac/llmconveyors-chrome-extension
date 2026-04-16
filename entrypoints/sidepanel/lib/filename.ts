// SPDX-License-Identifier: MIT
/**
 * Build download filenames from artifact naming metadata.
 *
 * Mirrors e:/llmconveyors.com/src/lib/generation/artifact-filename.ts so
 * extension-downloaded artifacts land with the same filename format as
 * the web dashboard.
 *
 * Format: Fullname_Companyname_Role_Suffix.ext
 */

const MAX_SEGMENT_LENGTH = 40;

function sanitizeSegment(raw: string): string {
  return raw
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '_')
    .replace(/-+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, MAX_SEGMENT_LENGTH);
}

export type NamingMetadata = {
  readonly fullName?: string;
  readonly companyName?: string;
  readonly jobTitle?: string;
};

export function extractNamingMetadata(
  metadata?: Record<string, unknown> | null,
): NamingMetadata {
  if (!metadata) return {};
  const pick = (key: string): string | undefined => {
    const raw = metadata[key];
    return typeof raw === 'string' && raw.trim().length > 0 ? raw.trim() : undefined;
  };
  return {
    fullName: pick('fullName'),
    companyName: pick('companyName'),
    jobTitle: pick('jobTitle'),
  };
}

export function buildArtifactFilename(
  naming: NamingMetadata,
  suffix: string,
  ext: string,
): string {
  const parts: string[] = [];
  if (naming.fullName) {
    const seg = sanitizeSegment(naming.fullName);
    if (seg) parts.push(seg);
  }
  if (naming.companyName) {
    const seg = sanitizeSegment(naming.companyName);
    if (seg) parts.push(seg);
  }
  if (naming.jobTitle) {
    const seg = sanitizeSegment(naming.jobTitle);
    if (seg) parts.push(seg);
  }
  parts.push(suffix);
  return `${parts.join('_')}.${ext}`;
}

/**
 * Standard suffix / extension pair for the artifact types the extension
 * surfaces. Keep in sync with the web dashboard's download handlers.
 */
export function defaultFilenameForType(
  type: string,
  mimeType: string | null,
): { suffix: string; ext: string } {
  const ext = extensionFromMime(mimeType);
  switch (type) {
    case 'cv':
      return { suffix: 'Resume', ext };
    case 'cover-letter':
      return { suffix: 'Cover_Letter', ext };
    case 'cold-email':
      return { suffix: 'Cold_Email', ext };
    case 'ats-comparison':
      return { suffix: 'ATS_Report', ext };
    case 'deep-research':
      return { suffix: 'Research', ext };
    default:
      return { suffix: type.replace(/[^\w-]/g, '_'), ext };
  }
}

function extensionFromMime(mimeType: string | null): string {
  if (!mimeType) return 'txt';
  const lower = mimeType.toLowerCase();
  if (lower.includes('pdf')) return 'pdf';
  if (lower.includes('json')) return 'json';
  if (lower.includes('html')) return 'html';
  if (lower.includes('markdown')) return 'md';
  return 'txt';
}
