// SPDX-License-Identifier: MIT
/**
 * B2bSalesActions - action panel rendered when the active agent is
 * 'b2b-sales'. Shows two CTAs and intentionally omits Fill / Highlight:
 *   1. Research company (primary) - enabled on any page with a valid URL;
 *      uses the current tab URL as companyWebsite.
 *   2. Draft outreach email - enabled when the current URL is a person's
 *      profile page (currently: linkedin.com/in/*).
 *
 * Both disable when credits === 0 and expose a "Get credits" link.
 */

import React from 'react';
import type { CreditsState } from '@/src/background/messaging/protocol';
import { GenerateButton } from './GenerateButton';
import { GetCreditsLink } from './GetCreditsLink';

export interface B2bSalesActionsProps {
  readonly tabUrl: string | null;
  readonly credits: CreditsState | null;
}

function isLinkedInProfileUrl(url: string | null): boolean {
  if (url === null) return false;
  try {
    const u = new URL(url);
    if (!u.hostname.endsWith('linkedin.com')) return false;
    return /^\/in\//.test(u.pathname);
  } catch {
    return false;
  }
}

function deriveCompanyWebsite(url: string | null): string {
  if (url === null) return '';
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.hostname}`;
  } catch {
    return '';
  }
}

function deriveCompanyNameFromUrl(url: string | null): string {
  if (url === null) return '';
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');
    const firstLabel = host.split('.')[0] ?? '';
    return firstLabel.length > 0
      ? firstLabel.charAt(0).toUpperCase() + firstLabel.slice(1)
      : '';
  } catch {
    return '';
  }
}

export function B2bSalesActions({
  tabUrl,
  credits,
}: B2bSalesActionsProps): React.ReactElement {
  const outOfCredits = (credits?.balance ?? 0) <= 0;
  const hasTabUrl =
    tabUrl !== null && (tabUrl.startsWith('http://') || tabUrl.startsWith('https://'));
  const isProfile = isLinkedInProfileUrl(tabUrl);

  let researchDisabledReason: string | undefined;
  if (outOfCredits) {
    researchDisabledReason = 'You are out of credits';
  } else if (!hasTabUrl) {
    researchDisabledReason = 'Open a company web page first';
  }

  let outreachDisabledReason: string | undefined;
  if (outOfCredits) {
    outreachDisabledReason = 'You are out of credits';
  } else if (!isProfile) {
    outreachDisabledReason = 'Open a LinkedIn profile to draft outreach';
  }

  const companyWebsite = deriveCompanyWebsite(tabUrl);
  const companyName = deriveCompanyNameFromUrl(tabUrl);

  return (
    <section
      data-testid="action-area"
      data-agent="b2b-sales"
      className="flex flex-col gap-2 rounded-card border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900"
    >
      <GenerateButton
        agentId="b2b-sales"
        disabled={outOfCredits || !hasTabUrl}
        disabledReason={researchDisabledReason}
        primaryLabel="Research company"
        payload={{
          kind: 'b2b-sales',
          companyName,
          companyWebsite,
        }}
        testIdSuffix="research"
      />
      <GenerateButton
        agentId="b2b-sales"
        disabled={outOfCredits || !isProfile}
        disabledReason={outreachDisabledReason}
        primaryLabel="Draft outreach email"
        payload={{
          kind: 'b2b-sales-outreach',
          profileUrl: tabUrl ?? '',
        }}
        testIdSuffix="outreach"
      />
      {outOfCredits ? <GetCreditsLink /> : null}
    </section>
  );
}
