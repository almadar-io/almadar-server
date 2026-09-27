/**
 * Firestore store for pending OAuth grants.
 *
 * Implements `@almadar/integrations`' `PendingGrantStore` STRUCTURALLY (this
 * package does not depend on @almadar/integrations, like
 * `FirestoreCredentialPersistence`), so every instance of a multi-instance host
 * sees the same in-flight authorizations. `take` reads and deletes in one
 * transaction: a grant is handed out once, and never after its TTL.
 */
import type { DocumentData } from 'firebase-admin/firestore';
import { getFirestore } from './db.js';

/** The slice of Firestore this store uses; a firebase-admin `Firestore` satisfies it. */
export interface GrantDocRef {
  set(data: DocumentData): Promise<object>;
}

export interface GrantTransaction {
  get(ref: GrantDocRef): Promise<{ exists: boolean; data(): DocumentData | undefined }>;
  delete(ref: GrantDocRef): object;
}

export interface GrantFirestore {
  collection(name: string): {
    doc(id: string): GrantDocRef;
    where(field: string, op: '<', value: number): { get(): Promise<{ docs: Array<{ ref: GrantDocRef }> }> };
  };
  runTransaction<T>(fn: (tx: GrantTransaction) => Promise<T>): Promise<T>;
  batch(): { delete(ref: GrantDocRef): object; commit(): Promise<object> };
}

const DEFAULT_COLLECTION = 'oauthPendingGrants';

interface StoredGrant<G> {
  grant: G;
  expiresAt: number;
}

export interface FirestorePendingGrantStoreOptions {
  /** Defaults to this package's `getFirestore()`; a host with its own Firebase app passes its instance. */
  firestore?: GrantFirestore;
  collection?: string;
}

export class FirestorePendingGrantStore<G extends object> {
  private readonly firestore: () => GrantFirestore;
  private readonly collection: string;

  constructor(options: FirestorePendingGrantStoreOptions = {}) {
    const injected = options.firestore;
    this.firestore = injected ? () => injected : getFirestore;
    this.collection = options.collection ?? DEFAULT_COLLECTION;
  }

  private ref(state: string) {
    return this.firestore().collection(this.collection).doc(state);
  }

  async put(state: string, grant: G, ttlMs: number): Promise<void> {
    const stored: StoredGrant<G> = { grant, expiresAt: Date.now() + ttlMs };
    await this.ref(state).set(stored);
  }

  async take(state: string): Promise<G | null> {
    const ref = this.ref(state);
    return this.firestore().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return null;
      tx.delete(ref);
      const stored = snap.data() as StoredGrant<G>;
      return stored.expiresAt >= Date.now() ? stored.grant : null;
    });
  }

  async sweep(): Promise<void> {
    const expired = await this.firestore().collection(this.collection).where('expiresAt', '<', Date.now()).get();
    if (expired.docs.length === 0) return;
    const batch = this.firestore().batch();
    for (const doc of expired.docs) batch.delete(doc.ref);
    await batch.commit();
  }
}
