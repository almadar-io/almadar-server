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

import admin from 'firebase-admin';

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
    console.log(`Firebase Admin initialized for emulator: ${emulatorHost}`);
    return app;
  }

  // Service account file
  const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (serviceAccountPath) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const serviceAccount = require(serviceAccountPath);
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
    throw new Error(
      '@almadar/server: Firebase Admin SDK is not initialized. ' +
      'Call initializeFirebase() or admin.initializeApp() before using @almadar/server.'
    );
  }
  return admin.app();
}

/**
 * Get Firestore instance from the pre-initialized Firebase app.
 */
export function getFirestore(): admin.firestore.Firestore {
  return getApp().firestore();
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
