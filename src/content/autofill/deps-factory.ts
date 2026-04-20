// SPDX-License-Identifier: MIT
/**
 * Production AutofillControllerDeps factory.
 *
 * Per D20, no module-level singleton imports cross module boundaries at
 * the controller surface. Every cross-module dep goes through this
 * factory so tests never accidentally inherit production impls.
 */

import type { AutofillControllerDeps } from './autofill-controller';
import { loadAdapter } from './adapter-loader';
import { readProfile, defaultRequestMasterResume } from './profile-reader';
import { sendMessage } from '@/src/background/messaging/protocol';
import { createLogger } from '@/src/background/log';
import type { AtsAdapter } from 'ats-autofill-engine';
import { scanForm, fillField } from 'ats-autofill-engine/dom';
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
  controllerLogger.debug('createProductionDeps: constructing autofill dependencies');

  return {
    loadAdapter: (url) => {
      controllerLogger.debug('deps.loadAdapter invoked', { url });
      return loadAdapter(url, {
        logger: adapterLoaderLogger,
        dynamicImport: staticAdapterImport,
      });
    },
    scanGenericForm: (root) => {
      controllerLogger.debug('deps.scanGenericForm invoked');
      return scanForm(root);
    },
    fillGenericField: (instruction, root) => {
      controllerLogger.debug('deps.fillGenericField invoked', {
        selector: instruction.selector,
        fieldType: instruction.fieldType,
      });
      return fillField(instruction, root);
    },
    readProfile: () => {
      controllerLogger.debug('deps.readProfile invoked');
      return readProfile({
        logger: profileReaderLogger,
        now: () => Date.now(),
        requestMasterResume: defaultRequestMasterResume,
      });
    },
    // Resume file attach is out of scope for A8 single-pass happy path;
    // the plan-builder routes file fields to plan.skipped so this is
    // never called in the greenhouse/lever branch today. A placeholder
    // resolver returns null so the fallback path in the controller
    // records a failed entry if ever invoked.
    resolveFile: async () => null,
    broadcastIntent: (payload) => {
      broadcastLogger.debug('broadcastIntent invoked', {
        tabId: payload.tabId,
        kind: payload.kind,
        pageKind: payload.pageKind,
        url: payload.url,
      });
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
