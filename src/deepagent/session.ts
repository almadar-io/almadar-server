/**
 * Session Store (Rabit Compatibility Layer)
 *
 * Replaces the old Firestore-backed `SessionManager` singleton with
 * rabit's per-orbital `SessionStore` factory.
 *
 * @packageDocumentation
 */

let sessionStore: unknown = null;

/**
 * @deprecated Use `new SessionStore(workDir, workspace)` from `@almadar-io/rabit`.
 */
export async function getSessionStore(): Promise<unknown> {
  if (!sessionStore) {
    try {
      const { SessionStore: SessionStoreCtor } = await import('@almadar-io/rabit');
      // Rabit's SessionStore requires a WorkspaceService, not a Firestore db.
      throw new Error(
        'getSessionStore() is deprecated. ' +
          'Construct `new SessionStore(workDir, workspace)` from `@almadar-io/rabit` directly.',
      );
    } catch (err) {
      if ((err as Error).message.includes('Cannot find module') || (err as Error).message.includes('No matching export')) {
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
