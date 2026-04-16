// SPDX-License-Identifier: MIT
/**
 * ColdEmailBody -- port of the web app's ColdEmailCard
 * (e:/llmconveyors.com/src/components/shared/artifacts/ColdEmailCard.tsx).
 *
 * Renders an email envelope with recipient / cc / subject / body. The body
 * is plain text (with \n newlines) so we render it as `whitespace-pre-wrap`
 * rather than markdown -- cold emails are NOT markdown documents and the
 * previous ReactMarkdown path collapsed `\n` line breaks into spaces
 * (observed as "no formatting in the cold email artifact").
 *
 * Payload fields mirror the production ColdEmailPayload shape:
 *   toAddress / toName / toTitle
 *   ccAddress / ccName / ccTitle
 *   subject
 *   body (or content fallback)
 *   emailAddresses (array fallback used when toAddress missing)
 *
 * Legacy `Subject:` prefix at the top of `content` is stripped so the
 * subject field isn't duplicated in the body view.
 */

import React, { useMemo } from 'react';
import type { ArtifactPreview } from '@/src/background/messaging/schemas/artifact-preview.schema';

export interface ColdEmailBodyProps {
  readonly artifact: ArtifactPreview;
  readonly open: boolean;
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function firstString(xs: unknown): string {
  if (!Array.isArray(xs)) return '';
  for (const x of xs) {
    if (typeof x === 'string' && x.length > 0) return x;
  }
  return '';
}

interface ParsedEmail {
  readonly to: string;
  readonly toName: string;
  readonly toTitle: string;
  readonly cc: string;
  readonly ccName: string;
  readonly ccTitle: string;
  readonly subject: string;
  readonly body: string;
}

function parseEmail(artifact: ArtifactPreview): ParsedEmail {
  const p = (artifact.payload ?? {}) as Record<string, unknown>;
  const toAddress = str(p.toAddress) || firstString(p.emailAddresses);
  const ccAddress = str(p.ccAddress);
  const subject = str(p.subject) || deriveSubjectFromContent(artifact.content);
  let body =
    str(p.body) ||
    stripSubjectLine(artifact.content ?? '') ||
    str(p.content);
  // The backend sometimes serialises \n as a literal backslash-n. Undo
  // that so the body prints with real line breaks (web ColdEmailCard
  // does the same at deriveFields()).
  body = body.replace(/\\n/g, '\n');
  return {
    to: toAddress,
    toName: str(p.toName),
    toTitle: str(p.toTitle),
    cc: ccAddress,
    ccName: str(p.ccName),
    ccTitle: str(p.ccTitle),
    subject,
    body,
  };
}

function deriveSubjectFromContent(content: string | null): string {
  if (content === null) return '';
  const match = content.match(/^Subject:\s*(.+)$/im);
  return match && match[1] ? match[1].trim() : '';
}

function stripSubjectLine(content: string): string {
  if (content.length === 0) return '';
  return content.replace(/^Subject:\s*.+$\n?/im, '').trim();
}

function Row({
  label,
  value,
  name,
  title,
}: {
  label: string;
  value: string;
  name?: string;
  title?: string;
}): React.ReactElement | null {
  if (value.length === 0) return null;
  const annotation = [name, title].filter((s) => s && s.length > 0).join(' - ');
  return (
    <div className="flex items-start gap-2 text-xs">
      <span className="w-10 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {label}
      </span>
      <div className="flex min-w-0 flex-col">
        <span className="truncate text-zinc-900 dark:text-zinc-100">{value}</span>
        {annotation.length > 0 ? (
          <span className="truncate text-[10px] text-zinc-500 dark:text-zinc-400">
            {annotation}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export function ColdEmailBody({
  artifact,
  open,
}: ColdEmailBodyProps): React.ReactElement {
  const email = useMemo(() => parseEmail(artifact), [artifact]);

  const hasEnvelope =
    email.to.length > 0 ||
    email.cc.length > 0 ||
    email.subject.length > 0;

  // When closed, preview the first 400 chars of the body (like
  // TextArtifactBody). When open, show everything.
  const bodyDisplay = open
    ? email.body
    : email.body.length > 400
      ? `${email.body.slice(0, 400)}...`
      : email.body;

  return (
    <div
      data-testid="artifact-body-cold-email"
      className="flex flex-col gap-2 text-xs"
    >
      {hasEnvelope ? (
        <div
          data-testid="artifact-body-cold-email-envelope"
          className="flex flex-col gap-1.5 rounded-card border border-zinc-200 p-2 dark:border-zinc-700"
        >
          <Row
            label="To"
            value={email.to}
            name={email.toName}
            title={email.toTitle}
          />
          <Row
            label="Cc"
            value={email.cc}
            name={email.ccName}
            title={email.ccTitle}
          />
          {email.subject.length > 0 ? (
            <div className="flex items-start gap-2">
              <span className="w-10 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Subj
              </span>
              <span
                data-testid="artifact-body-cold-email-subject"
                className="font-medium text-zinc-900 dark:text-zinc-100"
              >
                {email.subject}
              </span>
            </div>
          ) : null}
        </div>
      ) : null}

      {bodyDisplay.length > 0 ? (
        <pre
          data-testid="artifact-body-cold-email-body"
          className="whitespace-pre-wrap break-words rounded-card bg-zinc-50 p-2 font-sans text-xs leading-relaxed text-zinc-800 dark:bg-zinc-800/50 dark:text-zinc-100"
        >
          {bodyDisplay}
        </pre>
      ) : (
        <p className="text-xs italic text-zinc-500 dark:text-zinc-400">
          No email body available.
        </p>
      )}
    </div>
  );
}
