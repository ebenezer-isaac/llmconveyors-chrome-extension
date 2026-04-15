// entrypoints/popup/App.tsx
import React from 'react';

export default function App(): React.ReactElement {
  return (
    <div className="min-h-[480px] w-[360px] bg-white p-4 text-zinc-900 font-display dark:bg-zinc-900 dark:text-zinc-50">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-brand-500">LLM Conveyors</h1>
        <span className="rounded-card bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
          v0.1.0
        </span>
      </header>

      <section className="rounded-card border border-zinc-200 p-3 dark:border-zinc-700">
        <p className="text-sm text-zinc-600 dark:text-zinc-300">
          Sign in to start auto-filling job applications on Greenhouse, Lever, and Workday.
        </p>
        <button
          type="button"
          disabled
          className="mt-3 w-full rounded-card bg-brand-500 py-2 text-sm font-medium text-white hover:bg-brand-900 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Sign in (arrives in A6)
        </button>
      </section>

      <footer className="mt-4 text-center text-xs text-zinc-400">
        Powered by llmconveyors.com
      </footer>
    </div>
  );
}
