// SPDX-License-Identifier: MIT
/**
 * Education editor -- mirrors WorkSection's add/remove/edit flow.
 */

import React, { useCallback, useState } from 'react';
import type { Profile, DeepPartial, ProfileEducationEntry } from '@/src/background/messaging/schemas/profile.schema';

export interface EducationSectionProps {
  readonly education: Profile['education'];
  readonly onUpdate: (patch: DeepPartial<Profile>) => Promise<void>;
  readonly disabled?: boolean;
}

type Draft = {
  institution: string;
  area: string;
  studyType: string;
  startDate: string;
  endDate: string;
};

function toDraft(e: ProfileEducationEntry): Draft {
  return {
    institution: e.institution,
    area: e.area,
    studyType: e.studyType,
    startDate: e.startDate,
    endDate: e.endDate,
  };
}

export function EducationSection(props: EducationSectionProps): React.ReactElement {
  const { education, onUpdate, disabled } = props;
  const [drafts, setDrafts] = useState<readonly Draft[]>(() => education.map(toDraft));

  const commitAll = useCallback(
    async (next: readonly Draft[]): Promise<void> => {
      const entries: ProfileEducationEntry[] = next.map((d) => ({
        institution: d.institution,
        area: d.area,
        studyType: d.studyType,
        startDate: d.startDate,
        endDate: d.endDate,
      }));
      await onUpdate({ education: entries });
    },
    [onUpdate],
  );

  const updateField = useCallback(
    (idx: number, field: keyof Draft) =>
      (event: React.ChangeEvent<HTMLInputElement>): void => {
        setDrafts((prev) => prev.map((d, i) => (i === idx ? { ...d, [field]: event.target.value } : d)));
      },
    [],
  );

  const commitIdx = useCallback(
    () => async (): Promise<void> => {
      await commitAll(drafts);
    },
    [commitAll, drafts],
  );

  const add = useCallback(async (): Promise<void> => {
    const next: readonly Draft[] = [
      ...drafts,
      { institution: '', area: '', studyType: '', startDate: '', endDate: '' },
    ];
    setDrafts(next);
    await commitAll(next);
  }, [commitAll, drafts]);

  const remove = useCallback(
    (idx: number) => async (): Promise<void> => {
      const next = drafts.filter((_, i) => i !== idx);
      setDrafts(next);
      await commitAll(next);
    },
    [commitAll, drafts],
  );

  return (
    <section
      data-testid="education-section"
      className="rounded-card border border-zinc-200 p-4 dark:border-zinc-700"
    >
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold">Education</h2>
        <button
          type="button"
          data-testid="education-add"
          onClick={() => {
            void add();
          }}
          disabled={disabled}
          className="rounded-card bg-brand-500 px-3 py-1 text-xs font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
        >
          Add entry
        </button>
      </div>
      {drafts.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">No education entries yet.</p>
      ) : null}
      <ul className="space-y-4">
        {drafts.map((d, idx) => (
          <li key={`edu-${idx}`} data-testid={`education-entry-${idx}`} className="rounded-card border border-zinc-100 p-3 dark:border-zinc-800">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <EduField label="Institution" testid={`education-${idx}-institution`} value={d.institution} onChange={updateField(idx, 'institution')} onBlur={commitIdx()} disabled={disabled} />
              <EduField label="Area" testid={`education-${idx}-area`} value={d.area} onChange={updateField(idx, 'area')} onBlur={commitIdx()} disabled={disabled} />
              <EduField label="Study type" testid={`education-${idx}-studyType`} value={d.studyType} onChange={updateField(idx, 'studyType')} onBlur={commitIdx()} disabled={disabled} />
              <EduField label="Start date" testid={`education-${idx}-startDate`} value={d.startDate} onChange={updateField(idx, 'startDate')} onBlur={commitIdx()} disabled={disabled} />
              <EduField label="End date" testid={`education-${idx}-endDate`} value={d.endDate} onChange={updateField(idx, 'endDate')} onBlur={commitIdx()} disabled={disabled} />
            </div>
            <div className="mt-2 text-right">
              <button
                type="button"
                data-testid={`education-${idx}-remove`}
                onClick={() => {
                  void remove(idx)();
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

interface EduFieldProps {
  readonly label: string;
  readonly testid: string;
  readonly value: string;
  readonly onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  readonly onBlur: () => Promise<void>;
  readonly disabled?: boolean;
}

function EduField(props: EduFieldProps): React.ReactElement {
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
