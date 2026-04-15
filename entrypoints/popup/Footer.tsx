// SPDX-License-Identifier: MIT
/**
 * Popup footer: version number only. Dashboard / Settings links were moved
 * to the UserMenu dropdown (post-104) so the footer stays minimal and the
 * account actions live next to the avatar where users expect them.
 */

import React from 'react';

export interface FooterProps {
  readonly version?: string;
}

export function Footer({ version = '0.1.0' }: FooterProps): React.ReactElement {
  return (
    <footer
      data-testid="popup-footer"
      className="mt-3 flex items-center justify-center border-t border-zinc-200 pt-2 text-xs text-zinc-500 dark:border-zinc-700 dark:text-zinc-400"
    >
      <span data-testid="popup-version">v{version}</span>
    </footer>
  );
}
