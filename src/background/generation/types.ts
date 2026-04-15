// SPDX-License-Identifier: MIT
/**
 * Shared client surface types for the generation module. Kept separate to
 * avoid a cycle between agent-client.ts and generation-handlers.ts.
 */

import type {
  AgentStartOutcome,
  AgentStartRequest,
  AgentInteractOutcome,
  AgentInteractRequest,
} from './agent-client';

export interface AgentClient {
  start: (req: AgentStartRequest) => Promise<AgentStartOutcome>;
  interact: (req: AgentInteractRequest) => Promise<AgentInteractOutcome>;
}

export type {
  AgentStartOutcome,
  AgentStartRequest,
  AgentInteractOutcome,
  AgentInteractRequest,
} from './agent-client';
