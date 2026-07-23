/**
 * Database Accessors & Initialization (firebase-admin v14)
 *
 * v14 uses modular subpath exports: `firebase-admin/app`, `firebase-admin/firestore`,
 * `firebase-admin/auth`. Named databases are supported via `initializeFirestore(app,
 * settings, databaseId)` — v12's `app.firestore(databaseId)` silently fell back to
 * (default), which is why this file exists.
 */

import { createLogger } from '@almadar/logger';
import {
  initializeApp,
  getApps,
  getApp,
  cert,
  applicationDefault,
  type App,
} from 'firebase-admin/app';
import {
  getFirestore as adminGetFirestore,
  initializeFirestore,
  type Firestore,
} from 'firebase-admin/firestore';
import { getAuth as adminGetAuth, type Auth } from 'firebase-admin/auth';

const dbLog = createLogger('almadar:server:db');

/**
 * Initialize Firebase Admin SDK from environment variables.
 *
 * Reads: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY,
 *        FIREBASE_SERVICE_ACCOUNT_PATH, FIRESTORE_EMULATOR_HOST
 *
 * Safe to call multiple times — returns existing app if already initialized.
 */
export function initializeFirebase(): App {
  if (getApps().length > 0) {
    return getApp();
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;

  if (emulatorHost) {
    const app = initializeApp({ projectId: projectId || 'demo-project' });
    dbLog.info('Firebase Admin initialized for emulator', { emulatorHost });
    return app;
  }

  const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (serviceAccountPath) {
    const serviceAccount = require(serviceAccountPath);
    return initializeApp({
      credential: cert(serviceAccount),
      projectId,
    });
  }

  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;
  if (projectId && clientEmail && privateKey) {
    return initializeApp({
      credential: cert({ projectId, clientEmail, privateKey: privateKey.replace(/\\n/g, '\n') }),
      projectId,
    });
  }

  if (projectId) {
    return initializeApp({
      credential: applicationDefault(),
      projectId,
    });
  }

  throw new Error(
    '@almadar/server: Cannot initialize Firebase — no credentials found. ' +
    'Set FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY, ' +
    'or FIREBASE_SERVICE_ACCOUNT_PATH, or FIRESTORE_EMULATOR_HOST.'
  );
}

function getAppInstance(): App {
  if (getApps().length === 0) {
    if (process.env.NODE_ENV !== 'production') {
      try {
        dbLog.warn('Firebase not yet initialized in this module instance (possible pnpm module duplication); auto-initializing from env');
        return initializeFirebase();
      } catch {
        // fall through
      }
    }
    throw new Error(
      '@almadar/server: Firebase Admin SDK is not initialized. ' +
      'Call initializeFirebase() before using @almadar/server.'
    );
  }
  return getApp();
}

/**
 * Get Firestore instance for the named database from env.
 *
 * Uses `initializeFirestore(app, settings, databaseId)` which creates a separate
 * Firestore instance per databaseId (firebase-admin v14). Falls back to (default)
 * when no env var is set.
 *
 * Reads FIRESTORE_DATABASE_ID (canonical) or FB_DB_ID (legacy app alias).
 */
export function getFirestore(): Firestore {
  const app = getAppInstance();
  const databaseId = process.env.FIRESTORE_DATABASE_ID ?? process.env.FB_DB_ID;
  const firestore = databaseId
    ? initializeFirestore(app, {}, databaseId)
    : initializeFirestore(app);
  firestore.settings({ ignoreUndefinedProperties: true });
  return firestore;
}

export function getAuth(): Auth {
  return adminGetAuth(getAppInstance());
}

export const db = new Proxy({} as Firestore, {
  get(_target, prop, receiver) {
    const firestore = getFirestore();
    const value = Reflect.get(firestore, prop, receiver);
    return typeof value === 'function' ? value.bind(firestore) : value;
  },
});
