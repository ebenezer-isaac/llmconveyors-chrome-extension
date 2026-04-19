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
import type { AutofillController } from './autofill-controller';

const log = createLogger('content-messaging');

export function registerFillListener(controller: AutofillController): void {
  onMessage('FILL_REQUEST', async (message) => {
    log.info('received FILL_REQUEST', {
      tabId: message.data.tabId,
      url: message.data.url,
      hasResumeAttachment: Boolean(message.data.resumeAttachment),
    });
    try {
      const response = await controller.executeFill({
        resumeAttachment: message.data.resumeAttachment,
      });
      log.info('returning FillRequestResponse', {
        ok: response.ok,
        aborted: response.aborted,
        abortReason: response.ok ? undefined : response.abortReason,
        filled: response.ok ? response.filled.length : undefined,
        skipped: response.ok ? response.skipped.length : undefined,
        failed: response.ok ? response.failed.length : undefined,
      });
      return response;
    } catch (err: unknown) {
      log.error('controller.executeFill unexpectedly threw', err, {
        tabId: message.data.tabId,
      });
      return {
        ok: false as const,
        aborted: true as const,
        abortReason: 'plan-failed' as const,
      };
    }
  });
}
