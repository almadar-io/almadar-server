/**
 * Firestore persistence for the tenant credential store (W4).
 *
 * Implements `@almadar/integrations`' `CredentialPersistence` contract
 * STRUCTURALLY (this package deliberately does not depend on
 * @almadar/integrations — the generated server owns that edge): rows are
 * AES-256-GCM ciphertext documents written by `CredentialStore`, this class
 * only moves them. It is the shared Firestore row store with the top-level
 * layout (collection name = the store's `CREDENTIAL_ENTITY_TYPE`); pass a
 * `root` (`hosted/<appId>`) to keep one app's credentials apart from another's.
 */
import { FirestorePersistence } from '../services/firestore/firestore-persistence.js';

export class FirestoreCredentialPersistence extends FirestorePersistence {
  constructor(root = '') {
    super({ root });
  }
}
