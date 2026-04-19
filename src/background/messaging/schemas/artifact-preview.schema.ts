// SPDX-License-Identifier: MIT
/**
 * ArtifactPreview -- normalized shape the sidepanel renders in its
 * collapsible artifact cards.
 *
 * This is a local mirror of the fields the extension needs from the
 * backend `@repo/shared-types` artifact schemas
 * (libs/shared-types/src/artifacts.ts on the main repo). The extension
 * is a separate package without a workspace link to shared-types, so
 * we keep a focused subset here that the sidepanel actually renders
 * (download + preview + copy).
 *
 * authoritative source: e:/llmconveyors.com/libs/shared-types/src/artifacts.ts
 * If the backend artifact schema changes, mirror the relevant fields here.
 */

import { z } from 'zod';

export type ArtifactType =
  | 'cv'
  | 'cover-letter'
  | 'cold-email'
  | 'ats-comparison'
  | 'deep-research'
  | 'other';

/**
 * Normalized view of a single artifact for the sidepanel. Every card
 * receives one of these; the body component picks rendering strategy
 * from `type`.
 */
export interface ArtifactPreview {
  readonly type: ArtifactType;
  readonly label: string;
  /** Plain-text content when inline; null when we only have a storageKey. */
  readonly content: string | null;
  readonly mimeType: string | null;
  readonly downloadUrl: string | null;
  readonly storageKey: string | null;
  /**
   * Dedicated storage key for a pre-rendered PDF variant. Only the CV
   * artifact carries this today (backend sets `pdfStorageKey` alongside
   * the JSON `storageKey`). The sidepanel's CvArtifactBody fetches the
   * PDF bytes via ARTIFACT_FETCH_BLOB and renders them in an iframe
   * when this field is present.
   */
  readonly pdfStorageKey: string | null;
  /**
   * Session id the artifact belongs to. Required when fetching blob
   * content via ARTIFACT_FETCH_BLOB because storage keys are scoped
   * per session on the backend.
   */
  readonly sessionId: string | null;
  /**
   * Suggested filename when the user clicks download. Sanitised by
   * entrypoints/sidepanel/lib/filename.ts to match the web dashboard
   * convention so Meta's "CV-John Smith.pdf" and the extension's
   * "John_Smith_Meta_SWE_Resume.pdf" do not both clutter the user's
   * Downloads folder.
   */
  readonly filename: string;
  /**
   * Optional JSON-serialisable payload the body component may read for
   * richer renders (e.g. ATS comparison before/after scores, CV section
   * list). Absent for purely text artifacts.
   */
  readonly payload?: Record<string, unknown>;
}

const RawArtifactShape = z
  .object({
    type: z.string().optional(),
    kind: z.string().optional(),
    artifactType: z.string().optional(),
    label: z.string().optional(),
    name: z.string().optional(),
    content: z.string().optional(),
    mimeType: z.string().optional(),
    downloadUrl: z.string().optional(),
    storageKey: z.string().optional(),
    pdfStorageKey: z.string().optional(),
    payload: z.record(z.unknown()).optional(),
  })
  .passthrough();

function canonicalType(raw: string | undefined): ArtifactType {
  if (raw === undefined) return 'other';
  const lower = raw.toLowerCase().replace(/_/g, '-');
  if (lower === 'cv' || lower === 'resume') return 'cv';
  if (lower === 'cover-letter' || lower === 'cover' || lower === 'letter') return 'cover-letter';
  if (lower === 'cold-email' || lower === 'email' || lower === 'outreach') return 'cold-email';
  if (
    lower === 'ats' ||
    lower === 'ats-comparison' ||
    lower === 'ats-report' ||
    lower === 'ats-score' ||
    lower === 'ats-scorecard'
  ) {
    return 'ats-comparison';
  }
  if (
    lower === 'research' ||
    lower === 'deep-research' ||
    lower === 'company-research' ||
    lower === 'person-research'
  ) {
    return 'deep-research';
  }
  return 'other';
}

function labelFor(
  type: ArtifactType,
  rawLabel: string | undefined,
  rawName: string | undefined,
  rawKind: string | undefined,
): string {
  if (typeof rawLabel === 'string' && rawLabel.trim().length > 0) return rawLabel.trim();
  if (typeof rawName === 'string' && rawName.trim().length > 0) return rawName.trim();
  switch (type) {
    case 'cv':
      return 'Resume';
    case 'cover-letter':
      return 'Cover Letter';
    case 'cold-email':
      return 'Cold Email';
    case 'ats-comparison':
      return 'ATS Comparison';
    case 'deep-research': {
      // Both person-research and company-research collapse to the
      // 'deep-research' render type (they share the same body layout),
      // but their LABEL must stay distinct so users can tell the two
      // apart in the Artifacts list -- otherwise both look like
      // 'Company Research'.
      const k = (rawKind ?? '').toLowerCase().replace(/_/g, '-');
      if (k === 'person-research') return 'Person Research';
      if (k === 'company-research') return 'Company Research';
      return 'Research';
    }
    default:
      return 'Artifact';
  }
}

/**
 * Normalize a raw backend artifact entry into the sidepanel's
 * ArtifactPreview shape. Returns null when the entry is unusable (no
 * type, no content / download path, etc.).
 *
 * The filename argument is supplied by the caller so filename
 * derivation can use the hydrated session's naming metadata (fullName
 * / companyName / jobTitle) which the artifact itself does not carry.
 */
export function normalizeArtifactPreview(
  raw: unknown,
  filename: string,
  sessionId: string | null = null,
): ArtifactPreview | null {
  const parsed = RawArtifactShape.safeParse(raw);
  if (!parsed.success) return null;
  const d = parsed.data;
  const rawType = d.type ?? d.kind ?? d.artifactType;
  const type = canonicalType(rawType);
  const label = labelFor(type, d.label, d.name, rawType);
  // Backend artifact shapes nest the primary text under payload.content
  // (e.g. company-research markdown, cover-letter body). Flatten that up
  // so the sidepanel's TextArtifactBody has something to render without
  // a lazy fetch when the hydrate response already carried the content.
  const payloadContent =
    d.payload !== undefined && typeof d.payload === 'object' && d.payload !== null
      ? (d.payload as Record<string, unknown>).content
      : undefined;
  const content =
    typeof d.content === 'string' && d.content.length > 0
      ? d.content
      : typeof payloadContent === 'string' && payloadContent.length > 0
      ? payloadContent
      : null;
  const mimeType = typeof d.mimeType === 'string' && d.mimeType.length > 0 ? d.mimeType : null;
  const downloadUrl =
    typeof d.downloadUrl === 'string' && d.downloadUrl.length > 0 ? d.downloadUrl : null;
  const storageKey =
    typeof d.storageKey === 'string' && d.storageKey.length > 0 ? d.storageKey : null;
  const pdfStorageKey =
    typeof d.pdfStorageKey === 'string' && d.pdfStorageKey.length > 0 ? d.pdfStorageKey : null;
  const hasStructuredPayload =
    d.payload !== undefined && typeof d.payload === 'object' && d.payload !== null;
  if (
    content === null &&
    downloadUrl === null &&
    storageKey === null &&
    pdfStorageKey === null &&
    !(type === 'ats-comparison' && hasStructuredPayload)
  ) {
    // Nothing for the sidepanel to render or download.
    return null;
  }
  return {
    type,
    label,
    content,
    mimeType,
    downloadUrl,
    storageKey,
    pdfStorageKey,
    sessionId,
    filename,
    ...(d.payload !== undefined ? { payload: d.payload } : {}),
  };
}
