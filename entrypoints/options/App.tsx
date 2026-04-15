// SPDX-License-Identifier: MIT
/**
 * Options page root.
 *
 * Transitional shell for the 101 pivot. The iframe-based rewrite ships in
 * commit 101.5; this placeholder ensures the options build stays green
 * while the profile stack is removed in 101.2.
 */

import React from 'react';

export default function App(): React.ReactElement {
  return (
    <div className="mx-auto min-h-screen max-w-3xl bg-white p-8 text-zinc-900 font-display dark:bg-zinc-900 dark:text-zinc-50">
      <h1 className="text-2xl font-bold">LLM Conveyors</h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
        Settings open in the side panel. This page will embed the web app shortly.
      </p>
    </div>
  );
}
