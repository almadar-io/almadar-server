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
export declare function initializeFirebase(): admin.app.App;
/**
 * Get Firestore instance from the pre-initialized Firebase app.
 */
export declare function getFirestore(): admin.firestore.Firestore;
/**
 * Get Firebase Auth instance from the pre-initialized Firebase app.
 */
export declare function getAuth(): admin.auth.Auth;
export { admin };
/**
 * Lazy Firestore proxy — resolves on first property access, not at import time.
 * This prevents the "Firebase not initialized" error during module loading.
 */
export declare const db: admin.firestore.Firestore;
//# sourceMappingURL=db.d.ts.map