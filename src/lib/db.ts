/**
 * Database Accessors
 *
 * This module provides accessors for Firebase Admin services (Firestore, Auth).
 * It does NOT initialize Firebase — the consuming application must call
 * admin.initializeApp() before importing @almadar/server modules.
 */

import admin from 'firebase-admin';

/**
 * Get the initialized Firebase app.
 * Throws if Firebase Admin SDK has not been initialized by the consumer.
 */
function getApp(): admin.app.App {
  if (admin.apps.length === 0) {
    throw new Error(
      '@almadar/server: Firebase Admin SDK is not initialized. ' +
      'Call admin.initializeApp() in your application before using @almadar/server.'
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
 * Convenience accessor — returns the Firestore instance.
 * Lazy: only resolves when called, not at import time.
 */
export const db = new Proxy({} as admin.firestore.Firestore, {
  get(_target, prop, receiver) {
    const firestore = getFirestore();
    const value = Reflect.get(firestore, prop, receiver);
    return typeof value === 'function' ? value.bind(firestore) : value;
  },
});
