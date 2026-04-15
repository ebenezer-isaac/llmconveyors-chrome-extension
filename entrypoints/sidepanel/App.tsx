// entrypoints/sidepanel/App.tsx
import React from 'react';

export default function App(): React.ReactElement {
  return (
    <div className="flex min-h-screen flex-col bg-white text-zinc-900 font-display dark:bg-zinc-900 dark:text-zinc-50">
      <header className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-700">
        <h1 className="text-lg font-bold text-brand-500">LLM Conveyors</h1>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">Artifact viewer</p>
      </header>
      <main className="flex-1 p-4">
        <div className="rounded-card border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500 dark:border-zinc-600 dark:text-zinc-400">
          No artifacts yet. Generate a CV from the popup to see it here.
        </div>
      </main>
    </div>
  );
}
