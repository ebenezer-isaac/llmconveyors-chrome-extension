// SPDX-License-Identifier: MIT
/**
 * ThemeRoot -- thin wrapper that applies the stored theme preference to
 * document.documentElement before children render.
 *
 * Mount this once per entrypoint (popup, sidepanel, options) wrapping the
 * ErrorBoundary child. It reads chrome.storage.local and applies the 'dark'
 * class on mount so there is no flash of the wrong colour scheme.
 *
 * When loading is true (storage read in flight) the component renders
 * children immediately; the class update fires as soon as storage resolves,
 * which is fast enough to avoid a visible flash in practice.
 */

import React from 'react';
import { useTheme } from '@/entrypoints/popup/useTheme';

interface ThemeRootProps {
  readonly children: React.ReactNode;
}

export function ThemeRoot({ children }: ThemeRootProps): React.ReactElement {
  // Calling useTheme here ensures applyTheme is invoked on mount for every
  // entrypoint without duplicating effect logic in each App component.
  useTheme();
  return <>{children}</>;
}
