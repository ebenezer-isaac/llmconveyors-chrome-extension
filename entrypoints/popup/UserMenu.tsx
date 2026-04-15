// SPDX-License-Identifier: MIT
/**
 * UserMenu -- avatar button that opens a dropdown mirroring the web app's
 * UserMenu (src/components/auth/UserMenu.tsx), adapted for the extension
 * popup surface.
 *
 * Contents:
 *   - avatar circle with initials fallback
 *   - usage section (credits + tier) with a mailto top-up link for free tier
 *   - Resume & CV  -> new tab at the web resume editor
 *   - Settings     -> new tab at the active agent's subdomain settings page
 *   - Dashboard    -> new tab at the active agent's subdomain root
 *   - Logout       -> existing signOut flow
 *
 * Closes on outside click or Escape. Keyboard arrows navigate menu items.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { CreditsState } from '@/src/background/messaging/protocol';
import type { AgentRegistryEntry } from '@/src/background/agents';
import { getTierLabel } from './useCredits';

const RESUME_EDITOR_URL = 'https://job-hunt.llmconveyors.com/en/settings/resume';
const CONTACT_EMAIL = 'ebnezr.isaac@gmail.com';

function openExternal(url: string): void {
  const g = globalThis as unknown as {
    chrome?: { tabs?: { create?: (opts: { url: string }) => void } };
  };
  if (g.chrome?.tabs?.create) {
    g.chrome.tabs.create({ url });
  } else {
    window.open(url, '_blank', 'noopener');
  }
}

function initialsFor(source: string | null): string {
  if (!source || source.length === 0) return '?';
  const parts = source.split(/\s+/).filter(Boolean);
  const letters = parts
    .map((part) => {
      const iter = [...part];
      return iter[0] ?? '';
    })
    .join('');
  const trimmed = letters.slice(0, 2).toUpperCase();
  return trimmed.length > 0 ? trimmed : '?';
}

export interface UserMenuProps {
  readonly userId: string;
  readonly displayName: string | null;
  readonly email: string | null;
  readonly credits: CreditsState | null;
  readonly activeAgent: AgentRegistryEntry | null;
  readonly onSignOut: () => void;
  readonly signOutDisabled?: boolean;
}

export function UserMenu({
  userId,
  displayName,
  email,
  credits,
  activeAgent,
  onSignOut,
  signOutDisabled = false,
}: UserMenuProps): React.ReactElement {
  const [open, setOpen] = useState<boolean>(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuItemsRef = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (!open) return;
    const handler = (event: MouseEvent): void => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
        return;
      }
      const items = menuItemsRef.current.filter(Boolean) as HTMLButtonElement[];
      const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        const next = currentIndex < items.length - 1 ? currentIndex + 1 : 0;
        items[next]?.focus();
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        const prev = currentIndex > 0 ? currentIndex - 1 : items.length - 1;
        items[prev]?.focus();
      }
    };
    document.addEventListener('keydown', handler);
    return () => {
      document.removeEventListener('keydown', handler);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const raf = requestAnimationFrame(() => {
      const items = menuItemsRef.current.filter(Boolean) as HTMLButtonElement[];
      items[0]?.focus();
    });
    return () => {
      cancelAnimationFrame(raf);
    };
  }, [open]);

  const menuItemIndexRef = useRef(0);
  menuItemIndexRef.current = 0;
  if (!open) menuItemsRef.current = [];
  const setMenuItemRef = useCallback((el: HTMLButtonElement | null) => {
    menuItemsRef.current[menuItemIndexRef.current++] = el;
  }, []);

  const toggleMenu = (): void => setOpen((prev) => !prev);

  const agentBase = activeAgent
    ? `https://${activeAgent.subdomain}.llmconveyors.com`
    : 'https://llmconveyors.com';

  const handleDashboard = (): void => {
    openExternal(`${agentBase}/en`);
    setOpen(false);
  };
  const handleSettings = (): void => {
    openExternal(`${agentBase}/en/settings`);
    setOpen(false);
  };
  const handleResume = (): void => {
    openExternal(RESUME_EDITOR_URL);
    setOpen(false);
  };
  const handleLogoutClick = (): void => {
    setOpen(false);
    onSignOut();
  };

  const displaySource = displayName ?? email ?? userId;
  const initials = initialsFor(displaySource);
  const tierLabel = getTierLabel(
    credits?.tier ?? 'free',
    credits?.byoKeyEnabled ?? false,
  );
  const creditsCount = credits?.credits ?? 0;
  const showTopUp = (credits?.tier ?? 'free') === 'free';
  const topUpHref = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(
    'Credit top-up request',
  )}&body=${encodeURIComponent(
    `Hi,\n\nI'd like to request additional credits for my account.\n\nUser id: ${userId}\n\nThanks`,
  )}`;

  return (
    <div className="relative" ref={menuRef} data-testid="user-menu">
      <button
        ref={triggerRef}
        type="button"
        data-testid="user-menu-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={toggleMenu}
        title={displaySource ?? undefined}
        className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border border-zinc-300 bg-zinc-100 text-xs font-semibold text-zinc-700 transition hover:border-zinc-400 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-200 dark:hover:border-zinc-500"
      >
        <span aria-hidden="true">{initials}</span>
      </button>
      {open ? (
        <div
          data-testid="user-menu-popover"
          className="absolute right-0 z-20 mt-2 w-64 rounded-card border border-zinc-200 bg-white p-2 text-zinc-900 shadow-xl dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
          role="menu"
        >
          <div className="mb-2 rounded-card bg-zinc-50 px-3 py-2 text-xs dark:bg-zinc-900">
            <p className="font-semibold text-zinc-900 dark:text-zinc-100">
              {displayName ?? email ?? 'Signed in'}
            </p>
            {email !== null && email !== displayName ? (
              <p className="truncate text-[11px] text-zinc-500 dark:text-zinc-400">
                {email}
              </p>
            ) : null}
          </div>
          {credits !== null ? (
            <div
              data-testid="user-menu-usage"
              className="mb-2 rounded-card bg-zinc-50 px-3 py-2 text-xs text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400"
            >
              <p className="font-semibold text-zinc-900 dark:text-zinc-100">Usage</p>
              <p>{creditsCount} credits</p>
              <p className="text-[11px]">{tierLabel}</p>
              {showTopUp ? (
                <p className="mt-1 text-[11px]">
                  Need more?{' '}
                  <a
                    data-testid="user-menu-topup-link"
                    href={topUpHref}
                    className="font-medium text-brand-600 underline underline-offset-2 hover:text-brand-700 dark:text-brand-400"
                  >
                    {CONTACT_EMAIL}
                  </a>
                </p>
              ) : null}
            </div>
          ) : null}
          <button
            ref={setMenuItemRef}
            type="button"
            role="menuitem"
            data-testid="user-menu-resume"
            onClick={handleResume}
            className="flex w-full items-center gap-2 rounded-card px-3 py-2 text-left text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-700"
          >
            Resume &amp; CV
          </button>
          <button
            ref={setMenuItemRef}
            type="button"
            role="menuitem"
            data-testid="user-menu-settings"
            onClick={handleSettings}
            className="flex w-full items-center gap-2 rounded-card px-3 py-2 text-left text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-700"
          >
            Settings
          </button>
          <button
            ref={setMenuItemRef}
            type="button"
            role="menuitem"
            data-testid="user-menu-dashboard"
            onClick={handleDashboard}
            className="flex w-full items-center gap-2 rounded-card px-3 py-2 text-left text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-700"
          >
            Dashboard
          </button>
          <button
            ref={setMenuItemRef}
            type="button"
            role="menuitem"
            data-testid="user-menu-logout"
            onClick={handleLogoutClick}
            disabled={signOutDisabled}
            className="flex w-full items-center gap-2 rounded-card px-3 py-2 text-left text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-60 dark:text-red-400 dark:hover:bg-red-900/30"
          >
            Log out
          </button>
        </div>
      ) : null}
    </div>
  );
}
