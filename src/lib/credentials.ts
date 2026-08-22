/**
 * Firestore persistence for the tenant credential store (W4).
 *
 * Implements `@almadar/integrations`' `CredentialPersistence` contract
 * STRUCTURALLY (this package deliberately does not depend on
 * @almadar/integrations — the generated server owns that edge): rows are
 * AES-256-GCM ciphertext documents written by `CredentialStore`, this class
 * only moves them. Collection name = the store's `CREDENTIAL_ENTITY_TYPE`.
 */
import type { EntityRow } from '@almadar/core';
import { getFirestore } from './db.js';

export class FirestoreCredentialPersistence {
  async create(entityType: string, data: EntityRow): Promise<{ id: string }> {
    const ref = await getFirestore().collection(entityType).add(data);
    return { id: ref.id };
  }

  async update(entityType: string, id: string, data: EntityRow): Promise<void> {
    await getFirestore().collection(entityType).doc(id).set(data, { merge: true });
  }

  async delete(entityType: string, id: string): Promise<void> {
    await getFirestore().collection(entityType).doc(id).delete();
  }

  async list(entityType: string): Promise<EntityRow[]> {
    const snapshot = await getFirestore().collection(entityType).get();
    return snapshot.docs.map((doc) => ({ ...(doc.data() as EntityRow), id: doc.id }));
  }
}
