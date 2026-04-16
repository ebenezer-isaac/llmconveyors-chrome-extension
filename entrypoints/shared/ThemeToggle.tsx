// SPDX-License-Identifier: MIT
/**
 * ThemeToggle -- compact cycle button used by both popup and sidepanel
 * headers. Each click advances light -> dark -> system -> light. Shares
 * the popup/useTheme hook, so state propagates across every open
 * extension surface via THEME_CHANGED broadcast + chrome.storage.onChanged.
 *
 * Moved from entrypoints/sidepanel/ so both surfaces import the same
 * component; the previous copy is a re-export for backwards compat.
 */

import React, { useCallback } from 'react';
import { useTheme } from '@/entrypoints/popup/useTheme';

function nextTheme(current: 'light' | 'dark' | 'system'): 'light' | 'dark' | 'system' {
  if (current === 'light') return 'dark';
  if (current === 'dark') return 'system';
  return 'light';
}

function IconFor({ theme }: { theme: 'light' | 'dark' | 'system' }): React.ReactElement {
  if (theme === 'light') {
    return (
      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
        <circle cx="7" cy="7" r="3" fill="currentColor" />
        <g stroke="currentColor" strokeWidth="1" strokeLinecap="round">
          <line x1="7" y1="1" x2="7" y2="2.5" />
          <line x1="7" y1="11.5" x2="7" y2="13" />
          <line x1="1" y1="7" x2="2.5" y2="7" />
          <line x1="11.5" y1="7" x2="13" y2="7" />
          <line x1="2.5" y1="2.5" x2="3.5" y2="3.5" />
          <line x1="10.5" y1="10.5" x2="11.5" y2="11.5" />
          <line x1="2.5" y1="11.5" x2="3.5" y2="10.5" />
          <line x1="10.5" y1="3.5" x2="11.5" y2="2.5" />
        </g>
      </svg>
    );
  }
  if (theme === 'dark') {
    return (
      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
        <path d="M11 9A5 5 0 0 1 5 3 5 5 0 1 0 11 9Z" fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <rect
        x="1.5"
        y="3"
        width="11"
        height="7"
        rx="1"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <line
        x1="5"
        y1="12"
        x2="9"
        y2="12"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function ThemeToggle(): React.ReactElement {
  const { theme, setTheme, loading } = useTheme();
  const cycle = useCallback(() => {
    void setTheme(nextTheme(theme));
  }, [theme, setTheme]);

  const label = theme === 'light' ? 'Light' : theme === 'dark' ? 'Dark' : 'System';

  return (
    <button
      type="button"
      data-testid="sidepanel-theme-toggle"
      data-theme={theme}
      onClick={cycle}
      disabled={loading}
      title={`Theme: ${label} (click to cycle)`}
      aria-label={`Theme: ${label}. Click to cycle.`}
      className="flex items-center gap-1 rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
    >
      <IconFor theme={theme} />
      <span className="sr-only">{label}</span>
    </button>
  );
}
