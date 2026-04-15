// SPDX-License-Identifier: MIT
/**
 * Skills editor -- tag-style list. Each row is one skill with a name,
 * level, and comma-separated keywords. Commit fires on blur or on tag
 * remove.
 */

import React, { useCallback, useState } from 'react';
import type { Profile, DeepPartial, ProfileSkill } from '@/src/background/messaging/schemas/profile.schema';

export interface SkillsSectionProps {
  readonly skills: Profile['skills'];
  readonly onUpdate: (patch: DeepPartial<Profile>) => Promise<void>;
  readonly disabled?: boolean;
}

type Draft = {
  name: string;
  level: string;
  keywords: string;
};

function toDraft(s: ProfileSkill): Draft {
  return {
    name: s.name,
    level: s.level,
    keywords: s.keywords.join(', '),
  };
}

function draftToSkill(d: Draft): ProfileSkill {
  const keywords = d.keywords
    .split(',')
    .map((k) => k.trim())
    .filter((k) => k.length > 0);
  return { name: d.name, level: d.level, keywords };
}

export function SkillsSection(props: SkillsSectionProps): React.ReactElement {
  const { skills, onUpdate, disabled } = props;
  const [drafts, setDrafts] = useState<readonly Draft[]>(() => skills.map(toDraft));

  const commitAll = useCallback(
    async (next: readonly Draft[]): Promise<void> => {
      await onUpdate({ skills: next.map(draftToSkill) });
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

  const commit = useCallback(async (): Promise<void> => {
    await commitAll(drafts);
  }, [commitAll, drafts]);

  const add = useCallback(async (): Promise<void> => {
    const next: readonly Draft[] = [...drafts, { name: '', level: '', keywords: '' }];
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
      data-testid="skills-section"
      className="rounded-card border border-zinc-200 p-4 dark:border-zinc-700"
    >
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold">Skills</h2>
        <button
          type="button"
          data-testid="skills-add"
          onClick={() => {
            void add();
          }}
          disabled={disabled}
          className="rounded-card bg-brand-500 px-3 py-1 text-xs font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
        >
          Add skill
        </button>
      </div>
      {drafts.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">No skills yet.</p>
      ) : null}
      <ul className="space-y-3">
        {drafts.map((d, idx) => (
          <li
            key={`skill-${idx}`}
            data-testid={`skills-entry-${idx}`}
            className="grid grid-cols-1 gap-2 rounded-card border border-zinc-100 p-3 sm:grid-cols-[1fr_1fr_2fr_auto] dark:border-zinc-800"
          >
            <SkillField label="Name" testid={`skills-${idx}-name`} value={d.name} onChange={updateField(idx, 'name')} onBlur={commit} disabled={disabled} />
            <SkillField label="Level" testid={`skills-${idx}-level`} value={d.level} onChange={updateField(idx, 'level')} onBlur={commit} disabled={disabled} />
            <SkillField label="Keywords (comma-separated)" testid={`skills-${idx}-keywords`} value={d.keywords} onChange={updateField(idx, 'keywords')} onBlur={commit} disabled={disabled} />
            <div className="flex items-end">
              <button
                type="button"
                data-testid={`skills-${idx}-remove`}
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

interface SkillFieldProps {
  readonly label: string;
  readonly testid: string;
  readonly value: string;
  readonly onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  readonly onBlur: () => Promise<void>;
  readonly disabled?: boolean;
}

function SkillField(props: SkillFieldProps): React.ReactElement {
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
