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
    // Pure deprecation stub: always throw the migration message (regardless of
    // whether the optional `@almadar-io/rabit` peer is installed).
    throw new Error(
      'getSessionStore() is deprecated. ' +
        'Construct `new SessionStore(workDir, workspace)` from `@almadar-io/rabit` directly.',
    );
  }
  return sessionStore;
}

/**
 * @deprecated Reset is a no-op without a real singleton.
 */
export function resetSessionStore(): void {
  sessionStore = null;
}
