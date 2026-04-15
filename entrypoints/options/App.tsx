// entrypoints/options/App.tsx
import React from 'react';

export default function App(): React.ReactElement {
  return (
    <div className="mx-auto min-h-screen max-w-2xl bg-white p-8 text-zinc-900 font-display dark:bg-zinc-900 dark:text-zinc-50">
      <header className="mb-8">
        <h1 className="text-2xl font-bold text-brand-500">LLM Conveyors - Options</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Configure your profile and preferences.
        </p>
      </header>

      <section className="rounded-card border border-zinc-200 p-6 dark:border-zinc-700">
        <h2 className="mb-2 text-base font-semibold">Profile</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-300">
          JSON Resume upload and profile overrides arrive in phase A7.
        </p>
      </section>
    </div>
  );
}
