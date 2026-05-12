/**
 * Session Manager Singleton
 *
 * Provides Firestore-backed session management with full GAP features.
 *
 * @packageDocumentation
 */

import type { SessionManager } from '@almadar-io/agent';
import { db } from '../lib/db.js';
import { getMemoryManager } from './memory.js';

let sessionManager: SessionManager | null = null;

/**
 * Get or create the SessionManager singleton
 */
export async function getSessionManager(): Promise<SessionManager> {
  if (!sessionManager) {
    const { SessionManager: SessionManagerCtor } = await import('@almadar-io/agent');
    const firestoreDb: import('@almadar-io/agent').FirestoreDb = { collection: (name: string) => db.collection(name) };
    const memoryManager = await getMemoryManager() as import('@almadar-io/agent').MemoryManager;
    sessionManager = new SessionManagerCtor({
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
