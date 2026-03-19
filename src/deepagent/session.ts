/**
 * Session Manager Singleton
 *
 * Provides Firestore-backed session management with full GAP features.
 *
 * @packageDocumentation
 */

import { db } from '../lib/db.js';
import { getMemoryManager } from './memory.js';

let sessionManager: unknown = null;

/**
 * Get or create the SessionManager singleton
 */
export async function getSessionManager() {
  if (!sessionManager) {
    const { SessionManager } = await import('@almadar-io/agent');
    const firestoreDb = db as unknown as import('@almadar-io/agent').FirestoreDb;
    const memoryManager = await getMemoryManager();
    sessionManager = new SessionManager({
      mode: 'firestore',
      firestoreDb,
      memoryManager, // Enable GAP-002D
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
