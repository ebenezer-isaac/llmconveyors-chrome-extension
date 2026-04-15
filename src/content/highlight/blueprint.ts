// SPDX-License-Identifier: MIT
/**
 * Blueprint for the A9 content-script highlight + intent module.
 *
 * Owns the HIGHLIGHT_APPLY + HIGHLIGHT_CLEAR handlers and the intent
 * detection bootstrap. A9 is a thin shim between A5's KEYWORDS_EXTRACT
 * background handler and B6's applyHighlights engine renderer.
 */

import type { ModuleBlueprint } from '../../_blueprints/blueprint.types';

export const blueprint: ModuleBlueprint = {
  moduleId: 'content/highlight',
  label: 'Content-Script Keyword Highlight + Intent Detection',
  description:
    'Detects page intent on content-script bootstrap and registers ' +
    'HIGHLIGHT_APPLY + HIGHLIGHT_CLEAR handlers. Online-only: the ' +
    'keyword extractor lives on the backend, the content script never ' +
    'carries an offline corpus. Single-flight mutex prevents ' +
    'concurrent applies. Auth loss tears down highlights silently.',
  category: 'highlight',
  publicExports: [
    'blueprint',
    'HIGHLIGHT_MODULE_BLUEPRINT',
    'registerHighlightHandlers',
    'handleAuthLost',
    'createApplyHandler',
    'createClearHandler',
    'KeywordsExtractResponseGuard',
    'getHighlightState',
    'resetHighlightState',
    'setHighlightState',
    'beginApply',
    'isApplyInProgress',
    'HighlightMutexError',
    'getJdCache',
    'setJdCache',
    'clearJdCache',
  ],
  forbiddenImports: [
    'entrypoints/popup',
    'entrypoints/options',
    'entrypoints/sidepanel',
    '@webext-core/messaging',
  ],
  messageHandlers: [],
  invariants: [
    {
      id: 'HIGHLIGHT-001',
      description:
        'HIGHLIGHT_APPLY is single-flight. Concurrent applies reject ' +
        'via HighlightMutexError so the popup can disable its toggle ' +
        'while a request is in flight.',
      severity: 'error',
      check: {
        type: 'custom',
        description: 'state.ts beginApply + apply-handler unit tests',
      },
      sourceRef: { file: 'state.ts', line: 1 },
    },
    {
      id: 'HIGHLIGHT-002',
      description:
        'Online-only. The content script never ships a keyword corpus. ' +
        'Every apply round-trips to the backend via KEYWORDS_EXTRACT.',
      severity: 'error',
      check: {
        type: 'custom',
        description: 'apply-handler.ts sendKeywordsExtract',
      },
      sourceRef: { file: 'apply-handler.ts', line: 1 },
    },
    {
      id: 'HIGHLIGHT-003',
      description:
        'AUTH_STATE_CHANGED with { signedIn: false } tears down any ' +
        'active highlights silently via handleAuthLost.',
      severity: 'error',
      check: {
        type: 'custom',
        description: 'auth-lost-handler.ts handleAuthLost',
      },
      sourceRef: { file: 'auth-lost-handler.ts', line: 1 },
    },
    {
      id: 'HIGHLIGHT-004',
      description:
        'Engine throws map to { ok: false, reason: render-error }. The ' +
        'apply handler never propagates engine exceptions to the bg.',
      severity: 'error',
      check: {
        type: 'custom',
        description: 'apply-handler.ts applyHighlights try/catch',
      },
      sourceRef: { file: 'apply-handler.ts', line: 1 },
    },
    {
      id: 'HIGHLIGHT-005',
      description:
        'D21 runtime guard: the bg KEYWORDS_EXTRACT response is ' +
        'validated with KeywordsExtractResponseGuard before the engine ' +
        'call. A drifted shape becomes { ok: false, reason: api-error }.',
      severity: 'error',
      check: {
        type: 'custom',
        description: 'guards.ts KeywordsExtractResponseGuard',
      },
      sourceRef: { file: 'guards.ts', line: 1 },
    },
    {
      id: 'HIGHLIGHT-006',
      description:
        'Intent detection runs once per content-script instantiation ' +
        'and broadcasts INTENT_DETECTED with tabId=-1 so A5 can ' +
        'substitute sender.tab.id.',
      severity: 'error',
      check: {
        type: 'custom',
        description: 'intent/detector.ts initIntentDetection',
      },
      sourceRef: { file: '../intent/detector.ts', line: 1 },
    },
  ],
  knownIssues: [],
};

export const HIGHLIGHT_MODULE_BLUEPRINT = blueprint;
