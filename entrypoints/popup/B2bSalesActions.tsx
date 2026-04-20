// SPDX-License-Identifier: MIT
/**
 * B2bSalesActions - action panel rendered when the active agent is
 * 'b2b-sales'. Shows two CTAs and intentionally omits Fill / Highlight:
 *   1. Research company (primary) - enabled on any page with a valid URL;
 *      uses the current tab URL as companyWebsite.
 *   2. Draft outreach email - enabled when the current URL is a person's
 *      profile page (currently: linkedin.com/in/*).
 *
 * Credits are NOT used to disable the buttons; the backend gates the
 * request and returns a credit error which surfaces inline. A "Get credits"
 * chip appears below the panel when the balance is zero.
 */

import React from 'react';
import type { ClientCreditsSnapshot } from '@/src/background/messaging/protocol';
import { GenerateButton } from './GenerateButton';
import { GetCreditsLink } from './GetCreditsLink';
import { useGenerationLock } from '@/entrypoints/shared/useGenerationLock';

export interface B2bSalesActionsProps {
  readonly tabUrl: string | null;
  readonly credits: ClientCreditsSnapshot | null;
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
  const generationLock = useGenerationLock({
    agentId: 'b2b-sales',
    tabUrl,
  });

  const outOfCredits = (credits?.credits ?? 0) <= 0;
  const hasTabUrl =
    tabUrl !== null && (tabUrl.startsWith('http://') || tabUrl.startsWith('https://'));
  const isProfile = isLinkedInProfileUrl(tabUrl);
  const generationBlocked = generationLock.active;

  const lockReason = generationLock.active
    ? 'Generation already running for this page'
    : undefined;

  const researchDisabledReason: string | undefined = !hasTabUrl
    ? 'Open a company web page first'
    : lockReason;
  const outreachDisabledReason: string | undefined = !isProfile
    ? 'Open a LinkedIn profile to draft outreach'
    : lockReason;

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
        disabled={!hasTabUrl || generationBlocked}
        disabledReason={researchDisabledReason}
        primaryLabel="Research company"
        payload={{
          kind: 'b2b-sales',
          companyName,
          companyWebsite,
        }}
        testIdSuffix="research"
        tabUrl={tabUrl}
        pageTitle={companyName.length > 0 ? companyName : null}
      />
      <GenerateButton
        agentId="b2b-sales"
        disabled={!isProfile || generationBlocked}
        disabledReason={outreachDisabledReason}
        primaryLabel="Draft outreach email"
        payload={{
          kind: 'b2b-sales-outreach',
          profileUrl: tabUrl ?? '',
        }}
        testIdSuffix="outreach"
        tabUrl={tabUrl}
        pageTitle={companyName.length > 0 ? companyName : null}
      />
      {outOfCredits ? <GetCreditsLink agentId="b2b-sales" /> : null}
    </section>
  );
}
