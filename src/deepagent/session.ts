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
import type { FirestoreDb } from '@almadar/agent';

let sessionManager: SessionManager | null = null;

/**
 * Adapter to make Firebase Firestore compatible with @almadar/agent FirestoreDb interface
 */
function createFirestoreAdapter(firestore: typeof db): FirestoreDb {
  return firestore as unknown as FirestoreDb;
}

/**
 * Get or create the SessionManager singleton
 */
export function getSessionManager(): SessionManager {
  if (!sessionManager) {
    sessionManager = new SessionManager({
      mode: 'firestore',
      firestoreDb: createFirestoreAdapter(db),
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
