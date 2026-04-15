// SPDX-License-Identifier: MIT
/**
 * Production AutofillControllerDeps factory.
 *
 * Per D20, no module-level singleton imports cross module boundaries at
 * the controller surface. Every cross-module dep goes through this
 * factory so tests never accidentally inherit production impls.
 */

import { browser } from 'wxt/browser';
import type { AutofillControllerDeps } from './autofill-controller';
import { loadAdapter } from './adapter-loader';
import { readProfile } from './profile-reader';
import { sendMessage } from '@/src/background/messaging/protocol';
import { createLogger } from '@/src/background/log';
import type { AtsAdapter } from 'ats-autofill-engine';
import { adapter as greenhouseAdapter } from 'ats-autofill-engine/greenhouse';
import { adapter as leverAdapter } from 'ats-autofill-engine/lever';
import { adapter as workdayAdapter } from 'ats-autofill-engine/workday';

/**
 * Static-import adapter resolver. Chrome MV3 content scripts cannot
 * evaluate arbitrary dynamic import specifiers, so all three adapters
 * are imported statically here and dispatched by kind. Dead-code
 * elimination keeps the bundle lean because vendor adapters are
 * sideEffect-free.
 */
const ADAPTERS: Readonly<Record<string, AtsAdapter>> = Object.freeze({
  greenhouse: greenhouseAdapter,
  lever: leverAdapter,
  workday: workdayAdapter,
});

function staticAdapterImport(
  specifier: string,
): Promise<{ readonly adapter?: AtsAdapter }> {
  const kind = specifier.replace(/^ats-autofill-engine\//, '');
  const adapter = ADAPTERS[kind];
  return Promise.resolve(adapter ? { adapter } : {});
}

export function createProductionDeps(): AutofillControllerDeps {
  const adapterLoaderLogger = createLogger('adapter-loader');
  const profileReaderLogger = createLogger('profile-reader');
  const controllerLogger = createLogger('autofill-controller');
  const broadcastLogger = createLogger('autofill-broadcast');

  const storageGet = async (
    key: string,
  ): Promise<Record<string, unknown>> => {
    return (await browser.storage.local.get(key)) as Record<string, unknown>;
  };

  return {
    loadAdapter: (url) =>
      loadAdapter(url, {
        logger: adapterLoaderLogger,
        dynamicImport: staticAdapterImport,
      }),
    readProfile: () =>
      readProfile({
        logger: profileReaderLogger,
        storageGet,
      }),
    // Resume file attach is out of scope for A8 single-pass happy path;
    // the plan-builder routes file fields to plan.skipped so this is
    // never called in the greenhouse/lever branch today. A placeholder
    // resolver returns null so the fallback path in the controller
    // records a failed entry if ever invoked.
    resolveFile: async () => null,
    broadcastIntent: (payload) => {
      void sendMessage('INTENT_DETECTED', payload).catch((err: unknown) => {
        broadcastLogger.warn('INTENT_DETECTED sendMessage failed', {
          err: err instanceof Error ? err.message : String(err),
        });
      });
    },
    logger: controllerLogger,
    now: () => Date.now(),
    document,
  };
}
