// SPDX-License-Identifier: MIT
/**
 * Options page root.
 *
 * Five tabs (Basics / Work / Education / Skills / Import-Export), each
 * rendered with a composite `key` of `${profileVersion}-${updatedAtMs}` per
 * D10 so external storage changes force-remount with fresh defaults. The
 * active tab is local state; switching tabs does not re-read storage.
 */

import React, { useState } from 'react';
import { useProfile } from './useProfile';
import { BasicsSection } from './BasicsSection';
import { WorkSection } from './WorkSection';
import { EducationSection } from './EducationSection';
import { SkillsSection } from './SkillsSection';
import { ImportExportSection } from './ImportExportSection';

type Tab = 'basics' | 'work' | 'education' | 'skills' | 'io';

const TABS: ReadonlyArray<{ id: Tab; label: string }> = [
  { id: 'basics', label: 'Basics' },
  { id: 'work', label: 'Work' },
  { id: 'education', label: 'Education' },
  { id: 'skills', label: 'Skills' },
  { id: 'io', label: 'Import / Export' },
];

export default function App(): React.ReactElement {
  const { profile, loading, error, saveState, updateProfile, uploadJsonResume } = useProfile();
  const [tab, setTab] = useState<Tab>('basics');

  const key =
    profile === null
      ? 'empty'
      : `${profile.profileVersion}-${profile.updatedAtMs}`;
  const disabled = saveState === 'saving';

  return (
    <div className="mx-auto min-h-screen max-w-3xl bg-white p-8 text-zinc-900 font-display dark:bg-zinc-900 dark:text-zinc-50">
      <header className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-brand-500">LLM Conveyors - Options</h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Upload a JSON Resume or edit your profile inline. Used to auto-fill job applications.
          </p>
        </div>
        <div className="text-right text-xs text-zinc-500 dark:text-zinc-400">
          <p data-testid="save-state">{renderSaveState(saveState)}</p>
          {error !== null ? (
            <p data-testid="save-error" className="mt-1 rounded-card bg-red-50 px-2 py-1 text-red-800 dark:bg-red-900 dark:text-red-100">
              {error}
            </p>
          ) : null}
        </div>
      </header>

      <nav
        role="tablist"
        aria-label="Profile sections"
        className="mb-6 flex flex-wrap gap-1 border-b border-zinc-200 dark:border-zinc-700"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            data-testid={`tab-${t.id}`}
            onClick={() => setTab(t.id)}
            className={
              tab === t.id
                ? 'border-b-2 border-brand-500 px-3 py-2 text-sm font-semibold text-brand-500'
                : 'border-b-2 border-transparent px-3 py-2 text-sm font-medium text-zinc-600 hover:text-brand-500 dark:text-zinc-300'
            }
          >
            {t.label}
          </button>
        ))}
      </nav>

      {loading ? (
        <p data-testid="options-loading" className="text-sm text-zinc-500">
          Loading profile...
        </p>
      ) : profile === null ? (
        <section
          data-testid="empty-state"
          className="rounded-card border border-dashed border-zinc-300 p-6 text-center dark:border-zinc-700"
        >
          <p className="text-sm text-zinc-600 dark:text-zinc-300">
            No profile yet. Upload a JSON Resume to get started.
          </p>
          <div className="mt-4">
            <ImportExportSection
              profile={null}
              onUpload={uploadJsonResume}
              disabled={disabled}
            />
          </div>
        </section>
      ) : (
        <div role="tabpanel" data-testid="options-panel">
          {tab === 'basics' ? (
            <BasicsSection
              key={`basics-${key}`}
              basics={profile.basics}
              onUpdate={updateProfile}
              disabled={disabled}
            />
          ) : null}
          {tab === 'work' ? (
            <WorkSection
              key={`work-${key}`}
              work={profile.work}
              onUpdate={updateProfile}
              disabled={disabled}
            />
          ) : null}
          {tab === 'education' ? (
            <EducationSection
              key={`education-${key}`}
              education={profile.education}
              onUpdate={updateProfile}
              disabled={disabled}
            />
          ) : null}
          {tab === 'skills' ? (
            <SkillsSection
              key={`skills-${key}`}
              skills={profile.skills}
              onUpdate={updateProfile}
              disabled={disabled}
            />
          ) : null}
          {tab === 'io' ? (
            <ImportExportSection
              key={`io-${key}`}
              profile={profile}
              onUpload={uploadJsonResume}
              disabled={disabled}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}

function renderSaveState(state: 'idle' | 'saving' | 'saved' | 'error'): string {
  switch (state) {
    case 'idle':
      return 'Ready';
    case 'saving':
      return 'Saving...';
    case 'saved':
      return 'Saved';
    case 'error':
      return 'Error';
    default:
      return '';
  }
}
