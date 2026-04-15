// SPDX-License-Identifier: MIT
/**
 * Blueprint for the A11 side panel entrypoint.
 *
 * The side panel is a passive dashboard. It owns zero background
 * handlers. Every state it renders is a read of state some other
 * module already captured: the popup's useAuthState (A6), A9's per-
 * tab intent, the session-storage keyword cache (A9 writes),
 * and the session-storage autofill history (A8 writes).
 */

import type { ModuleBlueprint } from '../../src/_blueprints/blueprint.types';

export const blueprint: ModuleBlueprint = {
  moduleId: 'entrypoints/sidepanel',
  label: 'Side Panel Entrypoint',
  description:
    'Chrome side_panel surface. Renders the current tab\'s detected ' +
    'JD, the extracted keyword list, and per-tab autofill history. ' +
    'Subscribes to chrome.storage.onChanged for live updates. ' +
    'Read-only: the side panel never writes state and never hits the ' +
    'backend directly; it only consumes INTENT_GET and session-storage ' +
    'caches populated by the popup + content scripts.',
  category: 'ui',
  publicExports: [],
  forbiddenImports: [
    // The side panel must not reach into background handler internals;
    // the only sanctioned cross-context channel is chrome.runtime
    // sendMessage / storage events.
    '**/src/background/messaging/handlers.ts',
  ],
  messageHandlers: [],
  invariants: [
    {
      id: 'SIDEPANEL-001',
      description:
        'useTargetTabId honors ?tabId=<n> URL override so the E2E ' +
        'harness can pin the panel to a specific ATS tab without the ' +
        'active-tab query returning the panel page itself.',
      severity: 'error',
      check: {
        type: 'custom',
        description: 'useTargetTabId.ts readTabIdOverride',
      },
      sourceRef: { file: 'useTargetTabId.ts', line: 1 },
    },
    {
      id: 'SIDEPANEL-002',
      description:
        'useKeywords reads `llmc.keywords.<tabId>` from ' +
        'chrome.storage.session and subscribes to onChanged so the ' +
        'keyword list updates when A9 HIGHLIGHT_APPLY completes.',
      severity: 'error',
      check: {
        type: 'custom',
        description: 'useKeywords.ts sessionKey + onChanged listener',
      },
      sourceRef: { file: 'useKeywords.ts', line: 1 },
    },
    {
      id: 'SIDEPANEL-003',
      description:
        'useAutofillHistory caps history at 20 entries per tab; older ' +
        'entries are dropped when recordAutofillResult appends.',
      severity: 'error',
      check: {
        type: 'custom',
        description: 'useAutofillHistory.ts MAX_ENTRIES_PER_TAB',
      },
      sourceRef: { file: 'useAutofillHistory.ts', line: 1 },
    },
    {
      id: 'SIDEPANEL-004',
      description:
        'useSidepanelIntent re-queries INTENT_GET when the bound tab ' +
        'id changes, so the panel reflects the current active tab ' +
        'after onActivated fires.',
      severity: 'error',
      check: {
        type: 'custom',
        description: 'useSidepanelIntent.ts useEffect deps',
      },
      sourceRef: { file: 'useSidepanelIntent.ts', line: 1 },
    },
    {
      id: 'SIDEPANEL-005',
      description:
        'Side panel is read-only: zero mutating fetch calls, zero ' +
        'background RPCs that change state. All observable writes ' +
        'originate from popup or content scripts.',
      severity: 'error',
      check: {
        type: 'custom',
        description: 'App.tsx composition + hook surface audit',
      },
      sourceRef: { file: 'App.tsx', line: 1 },
    },
  ],
  knownIssues: [],
};

export const SIDEPANEL_MODULE_BLUEPRINT = blueprint;
