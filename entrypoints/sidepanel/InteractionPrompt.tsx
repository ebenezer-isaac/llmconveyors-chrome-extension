// SPDX-License-Identifier: MIT
/**
 * InteractionPrompt - renders a minimal approve / reject / edit control for
 * backend-requested interactions.
 *
 * This MVP implements a generic prompt: approve, reject, and a free-form
 * text edit. Interaction-type-specific UIs (e.g. draft review with per-field
 * editing) are intentionally deferred until the backend ships their shapes
 * - the prompt still lets the user respond with `{ approved: bool, notes? }`
 * which covers the common gate pattern.
 */

import React, { useState } from 'react';
import { createLogger } from '@/src/background/log';

const log = createLogger('sidepanel:interaction-prompt');

type RuntimeMessenger = { sendMessage: (m: unknown) => Promise<unknown> };
function getRuntime(): RuntimeMessenger | null {
  const g = globalThis as unknown as {
    chrome?: { runtime?: RuntimeMessenger };
    browser?: { runtime?: RuntimeMessenger };
  };
  return g.chrome?.runtime ?? g.browser?.runtime ?? null;
}

export interface InteractionPromptProps {
  readonly agentType: 'job-hunter' | 'b2b-sales';
  readonly generationId: string;
  readonly interactionType: string;
}

/**
 * Interaction IDs come from the backend SSE payload. The MVP prompt does not
 * track the latest interactionId separately; instead it derives a stable id
 * from generationId + interactionType which matches backend expectations for
 * the common gate pattern.
 */
function deriveInteractionId(generationId: string, type: string): string {
  return `${generationId}:${type}`;
}

export function InteractionPrompt({
  agentType,
  generationId,
  interactionType,
}: InteractionPromptProps): React.ReactElement {
  const [notes, setNotes] = useState<string>('');
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<null | 'approved' | 'rejected'>(null);

  async function respond(approved: boolean): Promise<void> {
    const runtime = getRuntime();
    if (runtime === null) {
      setError('Runtime unavailable');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const raw = await runtime.sendMessage({
        key: 'GENERATION_INTERACT',
        data: {
          agentType,
          generationId,
          interactionId: deriveInteractionId(generationId, interactionType),
          interactionType,
          interactionData: { approved, notes: notes.trim() ? notes.trim() : undefined },
        },
      });
      if (!raw || typeof raw !== 'object') {
        setError('Empty response');
        return;
      }
      const env = raw as Record<string, unknown>;
      if (env.ok === true) {
        setSubmitted(approved ? 'approved' : 'rejected');
        return;
      }
      const reason = typeof env.reason === 'string' ? env.reason : 'unknown';
      setError(reason);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.warn('GENERATION_INTERACT failed', { error: message });
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  if (submitted !== null) {
    return (
      <div
        data-testid="interaction-submitted"
        data-result={submitted}
        className="rounded-card bg-zinc-100 px-3 py-2 text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
      >
        Response sent ({submitted}).
      </div>
    );
  }

  return (
    <section
      data-testid="interaction-prompt"
      data-interaction-type={interactionType}
      className="flex flex-col gap-2 rounded-card border border-amber-300 bg-amber-50 p-3 dark:border-amber-700 dark:bg-amber-900"
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-amber-900 dark:text-amber-100">
        Input needed: {interactionType}
      </p>
      <textarea
        data-testid="interaction-notes"
        aria-label="Notes"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Optional notes / edits..."
        rows={3}
        className="w-full rounded-card border border-zinc-300 bg-white p-2 text-xs text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
      />
      <div className="flex gap-2">
        <button
          type="button"
          data-testid="interaction-approve"
          disabled={busy}
          onClick={() => {
            void respond(true);
          }}
          className="flex-1 rounded-card bg-brand-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-600 disabled:opacity-50"
        >
          Approve
        </button>
        <button
          type="button"
          data-testid="interaction-reject"
          disabled={busy}
          onClick={() => {
            void respond(false);
          }}
          className="flex-1 rounded-card border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        >
          Reject
        </button>
      </div>
      {error !== null ? (
        <p
          data-testid="interaction-error"
          className="rounded-card bg-red-50 px-2 py-1 text-[11px] text-red-800 dark:bg-red-900 dark:text-red-100"
        >
          {error}
        </p>
      ) : null}
    </section>
  );
}
