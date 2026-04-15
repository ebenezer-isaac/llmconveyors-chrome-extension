// SPDX-License-Identifier: MIT
/**
 * Import / Export section. Upload a JSON Resume file (parsed into a Profile
 * server-side via PROFILE_UPLOAD_JSON_RESUME) or export the current Profile
 * as a JSON Resume download.
 *
 * Size cap: 10 MB. MIME check: `application/json` or the file name ends
 * with `.json`. The user can cancel the file-picker safely.
 */

import React, { useCallback, useRef, useState } from 'react';
import type { Profile } from '@/src/background/messaging/schemas/profile.schema';
import { profileToJsonResume } from './profile-to-jsonresume';

const MAX_BYTES = 10 * 1024 * 1024;

export interface ImportExportSectionProps {
  readonly profile: Profile | null;
  readonly onUpload: (raw: unknown) => Promise<void>;
  readonly disabled?: boolean;
}

export function ImportExportSection(props: ImportExportSectionProps): React.ReactElement {
  const { profile, onUpload, disabled } = props;
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const onFile = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file) return;
      setLocalError(null);
      if (file.size > MAX_BYTES) {
        setLocalError('File too large (10 MB cap)');
        return;
      }
      const isJson = file.type === 'application/json' || file.name.toLowerCase().endsWith('.json');
      if (!isJson) {
        setLocalError('File must be JSON');
        return;
      }
      let text: string;
      try {
        text = await file.text();
      } catch (err) {
        setLocalError(err instanceof Error ? err.message : 'Failed to read file');
        return;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch (err) {
        setLocalError(err instanceof Error ? `Malformed JSON: ${err.message}` : 'Malformed JSON');
        return;
      }
      await onUpload(parsed);
    },
    [onUpload],
  );

  const onExport = useCallback((): void => {
    if (!profile) return;
    const exported = profileToJsonResume(profile);
    const blob = new Blob([JSON.stringify(exported, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'llmconveyors-profile.json';
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [profile]);

  return (
    <section
      data-testid="import-export-section"
      className="rounded-card border border-zinc-200 p-4 dark:border-zinc-700"
    >
      <h2 className="mb-3 text-base font-semibold">Import / Export</h2>
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="flex-1">
          <p className="mb-2 text-sm text-zinc-600 dark:text-zinc-300">
            Upload a JSON Resume (<code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">.json</code>) to populate your profile.
          </p>
          <input
            ref={inputRef}
            data-testid="import-file-input"
            type="file"
            accept="application/json,.json"
            onChange={(e) => {
              void onFile(e);
            }}
            disabled={disabled}
            className="block w-full text-sm text-zinc-700 file:mr-3 file:rounded-card file:border-0 file:bg-brand-500 file:px-3 file:py-1 file:text-xs file:font-semibold file:text-white hover:file:bg-brand-600 dark:text-zinc-200"
          />
          {localError !== null ? (
            <p data-testid="import-error" className="mt-2 rounded-card bg-red-50 px-2 py-1 text-xs text-red-800 dark:bg-red-900 dark:text-red-100">
              {localError}
            </p>
          ) : null}
        </div>
        <div className="flex-1">
          <p className="mb-2 text-sm text-zinc-600 dark:text-zinc-300">
            Download your profile as a JSON Resume file for backup or sharing.
          </p>
          <button
            type="button"
            data-testid="export-button"
            onClick={onExport}
            disabled={disabled || profile === null}
            className="rounded-card border border-brand-500 px-3 py-1 text-xs font-semibold text-brand-500 hover:bg-brand-50 disabled:opacity-50 dark:hover:bg-zinc-800"
          >
            Export JSON Resume
          </button>
        </div>
      </div>
    </section>
  );
}
