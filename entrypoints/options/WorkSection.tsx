// SPDX-License-Identifier: MIT
/**
 * Work editor -- add / remove / edit work entries. Each mutation rewrites
 * the full work array via PROFILE_UPDATE. Entries are committed on blur.
 */

import React, { useCallback, useState } from 'react';
import type { Profile, DeepPartial, ProfileWorkEntry } from '@/src/background/messaging/schemas/profile.schema';

export interface WorkSectionProps {
  readonly work: Profile['work'];
  readonly onUpdate: (patch: DeepPartial<Profile>) => Promise<void>;
  readonly disabled?: boolean;
}

type DraftEntry = {
  company: string;
  position: string;
  startDate: string;
  endDate: string;
  summary: string;
};

function toDraft(entry: ProfileWorkEntry): DraftEntry {
  return {
    company: entry.company,
    position: entry.position,
    startDate: entry.startDate,
    endDate: entry.endDate,
    summary: entry.summary ?? '',
  };
}

function toEntry(draft: DraftEntry): ProfileWorkEntry {
  const base: ProfileWorkEntry = {
    company: draft.company,
    position: draft.position,
    startDate: draft.startDate,
    endDate: draft.endDate,
  };
  if (draft.summary.length > 0) {
    return { ...base, summary: draft.summary };
  }
  return base;
}

export function WorkSection(props: WorkSectionProps): React.ReactElement {
  const { work, onUpdate, disabled } = props;
  const [drafts, setDrafts] = useState<readonly DraftEntry[]>(() => work.map(toDraft));

  const commitAll = useCallback(
    async (next: readonly DraftEntry[]): Promise<void> => {
      await onUpdate({ work: next.map(toEntry) });
    },
    [onUpdate],
  );

  const updateField = useCallback(
    (idx: number, field: keyof DraftEntry) =>
      (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>): void => {
        setDrafts((prev) => {
          const next = prev.map((d, i) => (i === idx ? { ...d, [field]: event.target.value } : d));
          return next;
        });
      },
    [],
  );

  const commitIdx = useCallback(
    (idx: number) => async (): Promise<void> => {
      await commitAll(drafts);
      void idx;
    },
    [commitAll, drafts],
  );

  const addEntry = useCallback(async (): Promise<void> => {
    const next: readonly DraftEntry[] = [
      ...drafts,
      { company: '', position: '', startDate: '', endDate: '', summary: '' },
    ];
    setDrafts(next);
    await commitAll(next);
  }, [commitAll, drafts]);

  const removeEntry = useCallback(
    (idx: number) => async (): Promise<void> => {
      const next = drafts.filter((_, i) => i !== idx);
      setDrafts(next);
      await commitAll(next);
    },
    [commitAll, drafts],
  );

  return (
    <section
      data-testid="work-section"
      className="rounded-card border border-zinc-200 p-4 dark:border-zinc-700"
    >
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold">Work experience</h2>
        <button
          type="button"
          data-testid="work-add"
          onClick={() => {
            void addEntry();
          }}
          disabled={disabled}
          className="rounded-card bg-brand-500 px-3 py-1 text-xs font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
        >
          Add entry
        </button>
      </div>
      {drafts.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">No work entries yet.</p>
      ) : null}
      <ul className="space-y-4">
        {drafts.map((d, idx) => (
          <li key={`work-${idx}`} data-testid={`work-entry-${idx}`} className="rounded-card border border-zinc-100 p-3 dark:border-zinc-800">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <TextField label="Company" testid={`work-${idx}-company`} value={d.company} onChange={updateField(idx, 'company')} onBlur={commitIdx(idx)} disabled={disabled} />
              <TextField label="Position" testid={`work-${idx}-position`} value={d.position} onChange={updateField(idx, 'position')} onBlur={commitIdx(idx)} disabled={disabled} />
              <TextField label="Start date" testid={`work-${idx}-startDate`} value={d.startDate} onChange={updateField(idx, 'startDate')} onBlur={commitIdx(idx)} disabled={disabled} />
              <TextField label="End date" testid={`work-${idx}-endDate`} value={d.endDate} onChange={updateField(idx, 'endDate')} onBlur={commitIdx(idx)} disabled={disabled} />
            </div>
            <label className="mt-2 flex flex-col text-xs text-zinc-600 dark:text-zinc-300">
              <span className="mb-1 font-medium">Summary</span>
              <textarea
                data-testid={`work-${idx}-summary`}
                value={d.summary}
                onChange={updateField(idx, 'summary')}
                onBlur={() => {
                  void commitIdx(idx)();
                }}
                disabled={disabled}
                rows={2}
                className="rounded-card border border-zinc-200 bg-white px-2 py-1 text-sm text-zinc-900 focus:border-brand-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              />
            </label>
            <div className="mt-2 text-right">
              <button
                type="button"
                data-testid={`work-${idx}-remove`}
                onClick={() => {
                  void removeEntry(idx)();
                }}
                disabled={disabled}
                className="text-xs font-medium text-red-600 hover:underline disabled:opacity-50"
              >
                Remove
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

interface TextFieldProps {
  readonly label: string;
  readonly testid: string;
  readonly value: string;
  readonly onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  readonly onBlur: () => Promise<void>;
  readonly disabled?: boolean;
}

function TextField(props: TextFieldProps): React.ReactElement {
  const { label, testid, value, onChange, onBlur, disabled } = props;
  return (
    <label className="flex flex-col text-xs text-zinc-600 dark:text-zinc-300">
      <span className="mb-1 font-medium">{label}</span>
      <input
        data-testid={testid}
        value={value}
        onChange={onChange}
        onBlur={() => {
          void onBlur();
        }}
        disabled={disabled}
        className="rounded-card border border-zinc-200 bg-white px-2 py-1 text-sm text-zinc-900 focus:border-brand-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
      />
    </label>
  );
}
