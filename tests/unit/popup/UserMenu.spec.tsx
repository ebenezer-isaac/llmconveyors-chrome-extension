// SPDX-License-Identifier: MIT
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { UserMenu } from '@/entrypoints/popup/UserMenu';
import type {
  ClientCreditsSnapshot,
  ClientProfileSnapshot,
} from '@/src/background/messaging/protocol-types';
import type { AgentRegistryEntry } from '@/src/background/agents';
import { installI18n } from './_i18n-test-helper';

const NOOP = (): void => undefined;

const ACTIVE_AGENT: AgentRegistryEntry = {
  id: 'job-hunter',
  routePath: '/job-hunt',
  subdomain: 'job-hunt',
  apiEndpoint: '/api/agents/job-hunter/generate',
  hasSettings: true,
  isPublic: true,
  accentColor: 'emerald',
  iconSvg: 'M0 0',
  label: 'Job Hunter',
  shortDescription: 'Tailor CVs',
  settingsPath: '/settings',
  dashboardPath: '',
  resumePath: '/settings/resume',
};

const CREDITS: ClientCreditsSnapshot = {
  credits: 10,
  tier: 'free',
  byoKeyEnabled: false,
};

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  installI18n();
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  container = null;
  root = null;
});

async function render(
  profile: ClientProfileSnapshot | null,
  userId = '4b9c-aaaa-1111',
): Promise<void> {
  await act(async () => {
    root = createRoot(container!);
    root.render(
      <UserMenu
        userId={userId}
        profile={profile}
        credits={CREDITS}
        activeAgent={ACTIVE_AGENT}
        onSignOut={NOOP}
      />,
    );
  });
}

function query(testId: string): HTMLElement | null {
  return container?.querySelector(`[data-testid="${testId}"]`) ?? null;
}

describe('UserMenu avatar', () => {
  it('renders the profile photoURL in an <img> with referrerPolicy no-referrer', async () => {
    await render({
      email: 'alice@example.com',
      displayName: 'Alice Wong',
      photoURL: 'https://cdn.example.com/a.png',
    });
    const img = query('user-menu-photo') as HTMLImageElement | null;
    expect(img).not.toBeNull();
    expect(img?.getAttribute('src')).toBe('https://cdn.example.com/a.png');
    expect(img?.getAttribute('referrerpolicy')).toBe('no-referrer');
    expect(query('user-menu-initials')).toBeNull();
  });

  it('falls back to initials when the image fails to load', async () => {
    await render({
      email: 'alice@example.com',
      displayName: 'Alice Wong',
      photoURL: 'https://cdn.example.com/a.png',
    });
    const img = query('user-menu-photo') as HTMLImageElement | null;
    expect(img).not.toBeNull();
    await act(async () => {
      img?.dispatchEvent(new Event('error'));
      await Promise.resolve();
    });
    expect(query('user-menu-photo')).toBeNull();
    expect(query('user-menu-initials')?.textContent).toBe('AW');
  });

  it('derives initials from displayName when no photo is available', async () => {
    await render({
      email: 'alice@example.com',
      displayName: 'Alice Wong',
      photoURL: null,
    });
    expect(query('user-menu-photo')).toBeNull();
    expect(query('user-menu-initials')?.textContent).toBe('AW');
  });

  it('falls back to email when displayName is missing', async () => {
    await render({
      email: 'jane.doe@example.com',
      displayName: null,
      photoURL: null,
    });
    // Email is a single whitespace-less token so the initials reduce to one
    // letter. The avatar still renders a deterministic character rather than
    // the default "?" because the source string is non-empty.
    expect(query('user-menu-initials')?.textContent).toBe('J');
  });

  it('uses both initials when displayName has two whitespace-separated parts', async () => {
    await render({
      email: null,
      displayName: 'Jane Doe',
      photoURL: null,
    });
    expect(query('user-menu-initials')?.textContent).toBe('JD');
  });

  it('falls back to userId when profile is entirely null', async () => {
    await render(null, '4b9c-aaaa-1111');
    // userId is one whitespace-less token so we get the first character only.
    // Documents the pre-profile-enrichment baseline that motivated this rewrite.
    expect(query('user-menu-initials')?.textContent).toBe('4');
  });

  it('treats empty photoURL string as no photo', async () => {
    await render({
      email: 'alice@example.com',
      displayName: 'Alice Wong',
      photoURL: '',
    });
    expect(query('user-menu-photo')).toBeNull();
    expect(query('user-menu-initials')?.textContent).toBe('AW');
  });

  it('shows the displayName in the dropdown and the email on a separate row', async () => {
    await render({
      email: 'alice@example.com',
      displayName: 'Alice Wong',
      photoURL: null,
    });
    const trigger = query('user-menu-trigger') as HTMLButtonElement;
    await act(async () => {
      trigger.click();
      await Promise.resolve();
    });
    expect(query('user-menu-display-name')?.textContent).toBe('Alice Wong');
    expect(query('user-menu-email')?.textContent).toBe('alice@example.com');
  });

  it('hides the email row when email matches the displayName', async () => {
    await render({
      email: 'alice@example.com',
      displayName: 'alice@example.com',
      photoURL: null,
    });
    const trigger = query('user-menu-trigger') as HTMLButtonElement;
    await act(async () => {
      trigger.click();
      await Promise.resolve();
    });
    expect(query('user-menu-display-name')?.textContent).toBe(
      'alice@example.com',
    );
    expect(query('user-menu-email')).toBeNull();
  });
});
