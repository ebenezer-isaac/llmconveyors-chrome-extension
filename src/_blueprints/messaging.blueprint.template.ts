/**
 * Template for `src/background/messaging/blueprint.ts`.
 *
 * A5 copies this file to its destination and fills `requestSchemaRef` and
 * `responseSchemaRef` with real Zod schema module paths. Every marker
 * `// A5 FILLS THIS` below is a knob A5 owns.
 *
 * The 19 ProtocolMap keys below match `03-keystone-contracts.md` section 1.1
 * verbatim. Any divergence is drift; the validator Layer 3 enforces that the
 * set of keys here matches the set of keys in `ProtocolMap`.
 */

import type { ModuleBlueprint, MessageHandlerEntry } from './blueprint.types';

// A5 FILLS THIS: replace './schemas/<key>-request' with actual schema module paths.
const PROTOCOL_SCHEMA_BASE = './schemas';

function h(entry: {
  key: string;
  description: string;
  handlerLocation: 'background' | 'content' | 'popup';
  broadcastOnly?: boolean;
  requestSchema: string;
  responseSchema: string;
  file: string;
  line: number;
}): MessageHandlerEntry {
  return {
    key: entry.key,
    description: entry.description,
    handlerLocation: entry.handlerLocation,
    requestSchemaRef: `${PROTOCOL_SCHEMA_BASE}/${entry.requestSchema}`,
    responseSchemaRef: `${PROTOCOL_SCHEMA_BASE}/${entry.responseSchema}`,
    broadcastOnly: entry.broadcastOnly ?? false,
    invariants: [],
    sourceRef: { file: entry.file, line: entry.line },
  };
}

// A5 FILLS THIS: swap file / line sourceRefs to real lines in handlers.ts once written.
export const blueprint: ModuleBlueprint = {
  moduleId: 'background/messaging',
  label: 'Background Messaging Surface',
  description:
    'Single API surface between content, background, popup, sidepanel, options. ' +
    '19 ProtocolMap keys routed through typed sendMessage/onMessage. Every handler ' +
    'validates its payload with Zod before business logic. Broadcast-only keys ' +
    'register inert handlers so the exhaustive HANDLERS record type-checks.',
  category: 'messaging',
  publicExports: ['ProtocolMap', 'sendMessage', 'onMessage', 'HANDLERS'],
  forbiddenImports: [
    'src/content/**',
    'entrypoints/content/**',
    'entrypoints/popup/**',
    'entrypoints/sidepanel/**',
    'entrypoints/options/**',
    'ats-autofill-engine/dist/**',
  ],
  messageHandlers: [
    // --- Auth (4) ---
    h({ key: 'AUTH_SIGN_IN',           description: 'Open OAuth window, exchange code, store tokens', handlerLocation: 'background', requestSchema: 'auth-sign-in-request', responseSchema: 'auth-state-response', file: 'src/background/messaging/handlers.ts', line: 1 }),
    h({ key: 'AUTH_SIGN_OUT',          description: 'Clear tokens, broadcast state change',             handlerLocation: 'background', requestSchema: 'auth-sign-out-request', responseSchema: 'auth-state-response', file: 'src/background/messaging/handlers.ts', line: 1 }),
    h({ key: 'AUTH_STATUS',            description: 'Return current AuthState',                          handlerLocation: 'background', requestSchema: 'auth-status-request', responseSchema: 'auth-state-response', file: 'src/background/messaging/handlers.ts', line: 1 }),
    h({ key: 'AUTH_STATE_CHANGED',     description: 'Broadcast on sign-in/sign-out (inert handler)',     handlerLocation: 'background', broadcastOnly: true, requestSchema: 'auth-state-response', responseSchema: 'void-response', file: 'src/background/messaging/handlers.ts', line: 1 }),
    // --- Profile (3) ---
    h({ key: 'PROFILE_GET',            description: 'Load Profile from chrome.storage.local',            handlerLocation: 'background', requestSchema: 'profile-get-request', responseSchema: 'profile-response', file: 'src/background/messaging/handlers.ts', line: 1 }),
    h({ key: 'PROFILE_UPDATE',         description: 'Deep-merge patch into stored Profile',              handlerLocation: 'background', requestSchema: 'profile-update-request', responseSchema: 'profile-update-response', file: 'src/background/messaging/handlers.ts', line: 1 }),
    h({ key: 'PROFILE_UPLOAD_JSON_RESUME', description: 'Parse JSON Resume, convert, store as Profile', handlerLocation: 'background', requestSchema: 'profile-upload-request', responseSchema: 'profile-upload-response', file: 'src/background/messaging/handlers.ts', line: 1 }),
    // --- Intent (2) ---
    h({ key: 'INTENT_DETECTED',        description: 'Content reports detected page intent',              handlerLocation: 'background', broadcastOnly: false, requestSchema: 'intent-detected-request', responseSchema: 'void-response', file: 'src/background/messaging/handlers.ts', line: 1 }),
    h({ key: 'INTENT_GET',             description: 'Read cached intent for a tab',                      handlerLocation: 'background', requestSchema: 'intent-get-request', responseSchema: 'intent-get-response', file: 'src/background/messaging/handlers.ts', line: 1 }),
    // --- Fill (1) ---
    h({ key: 'FILL_REQUEST',           description: 'Popup requests autofill; bg forwards to content',   handlerLocation: 'background', requestSchema: 'fill-request-request', responseSchema: 'fill-request-response', file: 'src/background/messaging/handlers.ts', line: 1 }),
    // --- Keywords (1) ---
    h({ key: 'KEYWORDS_EXTRACT',       description: 'Extract job keywords via backend API',              handlerLocation: 'background', requestSchema: 'keywords-extract-request', responseSchema: 'keywords-extract-response', file: 'src/background/messaging/handlers.ts', line: 1 }),
    // --- Highlight (3) ---
    h({ key: 'HIGHLIGHT_APPLY',        description: 'Apply keyword highlights to page (content-side)',   handlerLocation: 'content',    requestSchema: 'highlight-apply-request', responseSchema: 'highlight-apply-response', file: 'src/content/highlight/handlers.ts', line: 1 }),
    h({ key: 'HIGHLIGHT_CLEAR',        description: 'Clear all highlights on page (content-side)',       handlerLocation: 'content',    requestSchema: 'highlight-clear-request', responseSchema: 'highlight-clear-response', file: 'src/content/highlight/handlers.ts', line: 1 }),
    h({ key: 'HIGHLIGHT_STATUS',       description: 'Report highlight state for a tab',                  handlerLocation: 'background', requestSchema: 'highlight-status-request', responseSchema: 'highlight-status-response', file: 'src/background/messaging/handlers.ts', line: 1 }),
    // --- Generation (3) ---
    h({ key: 'GENERATION_START',       description: 'Trigger agent generation via backend',              handlerLocation: 'background', requestSchema: 'generation-start-request', responseSchema: 'generation-start-response', file: 'src/background/messaging/handlers.ts', line: 1 }),
    h({ key: 'GENERATION_UPDATE',      description: 'Broadcast generation progress (inert handler)',     handlerLocation: 'background', broadcastOnly: true, requestSchema: 'generation-update-broadcast', responseSchema: 'void-response', file: 'src/background/messaging/handlers.ts', line: 1 }),
    h({ key: 'GENERATION_CANCEL',      description: 'Cancel an in-flight generation',                    handlerLocation: 'background', requestSchema: 'generation-cancel-request', responseSchema: 'generation-cancel-response', file: 'src/background/messaging/handlers.ts', line: 1 }),
    // --- Broadcast (1) ---
    h({ key: 'DETECTED_JOB_BROADCAST', description: 'Fan out detected job to all listeners',             handlerLocation: 'background', broadcastOnly: true, requestSchema: 'detected-job-broadcast', responseSchema: 'void-response', file: 'src/background/messaging/handlers.ts', line: 1 }),
    // --- Credits (1) ---
    h({ key: 'CREDITS_GET',            description: 'Read credits balance from backend',                 handlerLocation: 'background', requestSchema: 'credits-get-request', responseSchema: 'credits-state-response', file: 'src/background/messaging/handlers.ts', line: 1 }),
  ],
  invariants: [
    // A5 FILLS THIS: populate with real invariants (e.g. PROFILE_UPDATE rejects empty patch).
  ],
  knownIssues: [],
};
