/**
 * Database Accessors & Initialization
 *
 * This module provides:
 * - `initializeFirebase()` — convenience function to init Firebase from env vars
 * - `getFirestore()`, `getAuth()` — accessors for Firebase services
 * - `db` — lazy Firestore proxy (no eager initialization)
 *
 * The consuming application MUST call `initializeFirebase()` or
 * `admin.initializeApp()` before using any Firebase-dependent features.
 */

import { createLogger } from '@almadar/logger';
import admin from 'firebase-admin';

const dbLog = createLogger('almadar:server:db');

/**
 * Initialize Firebase Admin SDK from environment variables.
 *
 * Reads: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY,
 *        FIREBASE_SERVICE_ACCOUNT_PATH, FIRESTORE_EMULATOR_HOST
 *
 * Safe to call multiple times — returns existing app if already initialized.
 */
export function initializeFirebase(): admin.app.App {
  // Already initialized — return existing app
  if (admin.apps.length > 0) {
    return admin.app();
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;

  // Emulator mode — no credentials needed
  if (emulatorHost) {
    const app = admin.initializeApp({
      projectId: projectId || 'demo-project',
    });
    dbLog.info('Firebase Admin initialized for emulator', { emulatorHost });
    return app;
  }

  // Service account file
  const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (serviceAccountPath) {
    // Dynamic require for JSON service account file at runtime
    const serviceAccount = require(serviceAccountPath) as admin.ServiceAccount;
    return admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId,
    });
  }

  // Inline credentials
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;
  if (projectId && clientEmail && privateKey) {
    return admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey: privateKey.replace(/\\n/g, '\n'),
      }),
      projectId,
    });
  }

  // Application default credentials (Cloud Run, etc.)
  if (projectId) {
    return admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      projectId,
    });
  }

  throw new Error(
    '@almadar/server: Cannot initialize Firebase — no credentials found. ' +
    'Set FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY, ' +
    'or FIREBASE_SERVICE_ACCOUNT_PATH, or FIRESTORE_EMULATOR_HOST.'
  );
}

/**
 * Get the initialized Firebase app.
 * Throws if Firebase Admin SDK has not been initialized.
 */
function getApp(): admin.app.App {
  if (admin.apps.length === 0) {
    // In non-production, auto-initialize if not done yet. This protects against
    // module resolution differences in pnpm workspaces, early imports in scripts,
    // or forgetting the explicit call in dev. In prod we still require explicit init.
    if (process.env.NODE_ENV !== 'production') {
      try {
        dbLog.warn('Firebase not yet initialized in this module instance (possible pnpm module duplication); auto-initializing from env');
        return initializeFirebase();
      } catch (e) {
        // fall through to the hard error
      }
    }
    throw new Error(
      '@almadar/server: Firebase Admin SDK is not initialized. ' +
      'Call initializeFirebase() or admin.initializeApp() before using @almadar/server.'
    );
  }
  return admin.app();
}

// Tracks Firestore instances we've already configured, so settings() runs once
// per instance (firebase-admin throws if settings() is called twice or after use).
const configuredFirestores = new WeakSet<admin.firestore.Firestore>();

/**
 * Apply the named-database setting from env to a Firestore instance, once.
 *
 * Reads FIRESTORE_DATABASE_ID (canonical) or FB_DB_ID (legacy app alias). This is
 * what makes every @almadar/server module instance — including duplicate copies
 * loaded via pnpm workspace resolution in dependent packages — target the SAME
 * named database instead of "(default)". Without it, a library that resolves a
 * second @almadar/server copy reads the wrong database and silently sees no data.
 *
 * No-op unless the env var is set (apps without a named DB keep default behavior),
 * and swallows the "already initialized" error when the app bootstrap already
 * configured this instance itself.
 */
function applyDatabaseSettings(firestore: admin.firestore.Firestore): void {
  if (configuredFirestores.has(firestore)) return;
  configuredFirestores.add(firestore);

  try {
    firestore.settings({ ignoreUndefinedProperties: true });
  } catch {
    // Firestore was already used/configured on this instance.
  }
}

/**
 * Get Firestore instance from the pre-initialized Firebase app.
 *
 * Passes the named-database ID directly to `app.firestore(databaseId)` —
 * firebase-admin silently ignores `databaseId` in `settings()`, so it must
 * be set at instance creation time. Falls back to the default database when
 * no env var is set.
 */
export function getFirestore(): admin.firestore.Firestore {
  const databaseId = process.env.FIRESTORE_DATABASE_ID ?? process.env.FB_DB_ID;
  // firebase-admin v12 types don't expose firestore(databaseId), but the runtime
  // (v13+) supports it. Cast to a precise callable signature — not `any`.
  const factory = getApp().firestore as (databaseId?: string) => admin.firestore.Firestore;
  const firestore = databaseId ? factory(databaseId) : factory();
  applyDatabaseSettings(firestore);
  return firestore;
}

/**
 * Get Firebase Auth instance from the pre-initialized Firebase app.
 */
export function getAuth(): admin.auth.Auth {
  return getApp().auth();
}

// Re-export admin for convenience
export { admin };

/**
 * Lazy Firestore proxy — resolves on first property access, not at import time.
 * This prevents the "Firebase not initialized" error during module loading.
 */
export const db = new Proxy({} as admin.firestore.Firestore, {
  get(_target, prop, receiver) {
    const firestore = getFirestore();
    const value = Reflect.get(firestore, prop, receiver);
    return typeof value === 'function' ? value.bind(firestore) : value;
  },
});
