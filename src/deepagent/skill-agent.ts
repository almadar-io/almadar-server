/**
 * Skill Agent Factory
 *
 * Creates DeepAgent instances with full GAP feature integration.
 *
 * @packageDocumentation
 */

import { getMemoryManager } from './memory.js';
import { getSessionManager } from './session.js';

async function loadAgent() {
  return import('@almadar-io/agent');
}

interface ServerSkillAgentOptions {
  userId: string;
  appId?: string;
  threadId?: string;
  skill?: string;
  [key: string]: unknown;
}

/**
 * Create a skill agent with full server-side GAP integration
 */
export async function createServerSkillAgent(
  options: ServerSkillAgentOptions,
) {
  const agent = await loadAgent();
  const memoryManager = await getMemoryManager();
  const sessionManager = await getSessionManager();
  const observability = agent.getObservabilityCollector();
  const multiUser = agent.getMultiUserManager();

  // Check access if resuming existing session
  if (options.threadId) {
    const access = multiUser.canAccessSession(options.threadId, {
      userId: options.userId,
      roles: ['user'],
    });
    if (!access.allowed) {
      throw new Error(`Access denied: ${access.reason}`);
    }
  }

  // Start observability
  observability.startSession(options.threadId ?? 'new', options.userId);

  // Create workflow tool wrapper for retry/telemetry (always enabled)
  const workflowToolWrapper = agent.createWorkflowToolWrapper({
    maxRetries: 2,
    enableTelemetry: true,
    timeoutMs: 300000, // 5 minutes
  });

  try {
    const result = await agent.createSkillAgent({
      ...options,
      memoryManager, // GAP-001: Enable memory
      userId: options.userId, // GAP-002D: Session → Memory sync
      appId: options.appId,
      toolWrapper: workflowToolWrapper.wrap, // Always use workflow wrapper for reliability
    });

    // Assign ownership for new sessions
    const threadId = result.threadId as string | undefined;
    if (threadId) {
      multiUser.assignSessionOwnership(threadId, options.userId);
    }

    // Record successful creation
    observability.recordEvent({
      type: 'session_start',
      sessionId: result.threadId,
      userId: options.userId,
      payload: { skill: options.skill },
    });

    return result;
  } catch (error) {
    observability.recordError(options.threadId ?? 'new', error as Error);
    throw error;
  }
}

// Re-export for convenience
export { getMemoryManager, getSessionManager };
