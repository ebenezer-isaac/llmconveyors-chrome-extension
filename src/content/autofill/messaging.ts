// SPDX-License-Identifier: MIT
/**
 * Content-side FILL_REQUEST listener.
 *
 * Flow (per A5 keystone 1.1 + 1.3):
 *   popup.sendMessage('FILL_REQUEST', { tabId, url })
 *   -> bg handler (A5) forwards via chrome.tabs.sendMessage
 *   -> content onMessage('FILL_REQUEST', ...) handler (this file)
 *   -> controller.executeFill()
 *   -> returns FillRequestResponse
 */

import { onMessage } from '@/src/background/messaging/protocol';
import { createLogger } from '@/src/background/log';
import { FillRequestResponseSchema } from '@/src/background/messaging/schemas/fill.schema';
import type { AutofillController } from './autofill-controller';

const log = createLogger('content-messaging');

type PlainRecord = Record<string, unknown>;

function asPlainRecord(value: unknown): PlainRecord | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as PlainRecord;
}

function summarizeKeys(value: unknown, limit = 12): readonly string[] {
  const rec = asPlainRecord(value);
  if (rec === null) return [];
  return Object.keys(rec).slice(0, limit);
}

export function registerFillListener(controller: AutofillController): void {
  log.info('registerFillListener: binding FILL_REQUEST listener');

  onMessage('FILL_REQUEST', async (message) => {
    log.debug('FILL_REQUEST listener invoked', {
      messageId: message.id,
      timestamp: message.timestamp,
      messageType: message.type,
      dataKeys: summarizeKeys(message.data),
    });
    log.info('received FILL_REQUEST', {
      tabId: message.data.tabId,
      url: message.data.url,
      hasResumeAttachment: Boolean(message.data.resumeAttachment),
      hasProfileData: Boolean(message.data.profileData),
    });
    try {
      log.debug('FILL_REQUEST: executeFill dispatching', {
        tabId: message.data.tabId,
      });
      const response = await controller.executeFill({
        resumeAttachment: message.data.resumeAttachment,
        profileData: message.data.profileData,
      });
      const parsed = FillRequestResponseSchema.safeParse(response);
      if (!parsed.success) {
        log.warn('executeFill returned non-conforming response shape', {
          tabId: message.data.tabId,
          issueCount: parsed.error.issues.length,
          responseKeys: summarizeKeys(response),
        });
      }
      log.info('returning FillRequestResponse', {
        ok: response.ok,
        aborted: response.aborted,
        abortReason: response.ok ? undefined : response.abortReason,
        filled: response.ok ? response.filled.length : undefined,
        skipped: response.ok ? response.skipped.length : undefined,
        failed: response.ok ? response.failed.length : undefined,
        responseKeys: summarizeKeys(response),
      });
      return response;
    } catch (err: unknown) {
      log.error('controller.executeFill unexpectedly threw', err, {
        tabId: message.data.tabId,
      });
      log.warn('FILL_REQUEST: returning fallback abort due to thrown executeFill', {
        tabId: message.data.tabId,
        errorType: err instanceof Error ? err.name : typeof err,
      });
      return {
        ok: false as const,
        aborted: true as const,
        abortReason: 'plan-failed' as const,
      };
    }
  });
}
