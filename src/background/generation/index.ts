// SPDX-License-Identifier: MIT
/**
 * Barrel for the generation module: agent client, SSE manager, handler
 * factory, and shared types.
 */

export { createAgentClient } from './agent-client';
export type {
  AgentClientDeps,
  AgentStartOutcome,
  AgentStartRequest,
  AgentInteractOutcome,
  AgentInteractRequest,
  AgentType,
} from './agent-client';
export { createSseManager, parseSseFrames } from './sse-manager';
export type { SseManagerDeps, Broadcaster } from './sse-manager';
export { createGenerationHandlers } from './generation-handlers';
export type { GenerationHandlerDeps } from './generation-handlers';
export type { AgentClient } from './types';
