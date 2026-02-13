/**
 * Session Manager Singleton
 *
 * Provides Firestore-backed session management with full GAP features.
 *
 * @packageDocumentation
 */

import { SessionManager } from '@almadar/agent';
import { db } from '../lib/db.js';
import { getMemoryManager } from './memory.js';

let sessionManager: SessionManager | null = null;

/**
 * Get or create the SessionManager singleton
 */
export function getSessionManager(): SessionManager {
  if (!sessionManager) {
    sessionManager = new SessionManager({
      mode: 'firestore',
      firestoreDb: db,
      memoryManager: getMemoryManager(), // Enable GAP-002D
      compactionConfig: {
        maxTokens: 150000,
        keepRecentMessages: 10,
        strategy: 'last',
      },
    });
  }
  return sessionManager;
}

/**
 * Reset the SessionManager (useful for testing)
 */
export function resetSessionManager(): void {
  sessionManager = null;
}
