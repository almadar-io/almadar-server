/**
 * Memory Manager Singleton
 *
 * Provides Firestore-backed memory management for DeepAgent.
 *
 * @packageDocumentation
 */

import { db } from '../lib/db.js';

let memoryManager: unknown = null;

/**
 * Get or create the MemoryManager singleton
 */
export async function getMemoryManager() {
  if (!memoryManager) {
    const { MemoryManager } = await import('@almadar-io/agent');
    memoryManager = new MemoryManager({
      db,
      usersCollection: 'agent_memory_users',
      projectsCollection: 'agent_memory_projects',
      generationsCollection: 'agent_memory_generations',
      patternsCollection: 'agent_memory_patterns',
      interruptsCollection: 'agent_memory_interrupts',
      feedbackCollection: 'agent_memory_feedback',
      checkpointsCollection: 'agent_memory_checkpoints',
      toolPreferencesCollection: 'agent_memory_tool_preferences',
    });
  }
  return memoryManager;
}

/**
 * Reset the MemoryManager (useful for testing)
 */
export function resetMemoryManager(): void {
  memoryManager = null;
}
