/**
 * Skill Agent Factory
 *
 * Creates DeepAgent instances with full GAP feature integration.
 *
 * @packageDocumentation
 */

import {
  createSkillAgent,
  getObservabilityCollector,
  getMultiUserManager,
  createWorkflowToolWrapper,
  type SkillAgentOptions,
  type SkillAgentResult,
} from '@almadar/agent';
import { getMemoryManager } from './memory.js';
import { getSessionManager } from './session.js';

interface ServerSkillAgentOptions extends SkillAgentOptions {
  /** User ID from Firebase Auth */
  userId: string;
  /** App/Project ID for context */
  appId?: string;
}

/**
 * Create a skill agent with full server-side GAP integration
 */
export async function createServerSkillAgent(
  options: ServerSkillAgentOptions,
): Promise<SkillAgentResult> {
  const memoryManager = getMemoryManager();
  const sessionManager = getSessionManager();
  const observability = getObservabilityCollector();
  const multiUser = getMultiUserManager();

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
  const workflowToolWrapper = createWorkflowToolWrapper({
    maxRetries: 2,
    enableTelemetry: true,
    timeoutMs: 300000, // 5 minutes
  });

  try {
    const result = await createSkillAgent({
      ...options,
      memoryManager, // GAP-001: Enable memory
      userId: options.userId, // GAP-002D: Session → Memory sync
      appId: options.appId,
      toolWrapper: workflowToolWrapper.wrap, // Always use workflow wrapper for reliability
    });

    // Assign ownership for new sessions
    if (result.threadId) {
      multiUser.assignSessionOwnership(result.threadId, options.userId);
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
