/**
 * Session Store (Rabit Compatibility Layer)
 *
 * Replaces the old Firestore-backed `SessionManager` singleton with
 * rabit's per-orbital `SessionStore` factory.
 *
 * @packageDocumentation
 */

import type { SessionStore } from '@almadar-io/rabit';

let sessionStore: SessionStore | null = null;

/**
 * @deprecated Use `new SessionStore(workDir, workspace)` from `@almadar-io/rabit`.
 */
export async function getSessionStore(): Promise<SessionStore> {
  if (!sessionStore) {
    try {
      const { SessionStore: SessionStoreCtor } = await import('@almadar-io/rabit');
      void SessionStoreCtor;
      throw new Error(
        'getSessionStore() is deprecated. ' +
          'Construct `new SessionStore(workDir, workspace)` from `@almadar-io/rabit` directly.',
      );
    } catch (err) {
      const message = (err as Error).message;
      if (message.includes('Cannot find module') || message.includes('No matching export')) {
        throw new Error('@almadar-io/rabit is not installed (optional peer dependency).');
      }
      throw err;
    }
  }
  return sessionStore;
}

/**
 * @deprecated Reset is a no-op without a real singleton.
 */
export function resetSessionStore(): void {
  sessionStore = null;
}
