/**
 * ValidationStore - Firestore CRUD for validation results
 *
 * Validation results stored at: users/{uid}/apps/{appId}/validation/current
 */

import type { ValidationResults, ValidationMeta } from '@almadar/core';
import { getFirestore } from '../lib/db.js';

const VALIDATION_COLLECTION = 'validation';
const VALIDATION_DOC_ID = 'current';

export class ValidationStore {
  private appsCollection: string;

  constructor(appsCollection = 'apps') {
    this.appsCollection = appsCollection;
  }

  private getDocPath(uid: string, appId: string): string {
    return `users/${uid}/${this.appsCollection}/${appId}/${VALIDATION_COLLECTION}/${VALIDATION_DOC_ID}`;
  }

  private getAppDocPath(uid: string, appId: string): string {
    return `users/${uid}/${this.appsCollection}/${appId}`;
  }

  /** Save validation results */
  async save(uid: string, appId: string, results: ValidationResults): Promise<void> {
    const db = getFirestore();

    await db.doc(this.getDocPath(uid, appId)).set(results);

    // Update validation metadata in main document
    const validationMeta: ValidationMeta = {
      errorCount: results.errors?.length || 0,
      warningCount: results.warnings?.length || 0,
      validatedAt: results.validatedAt,
    };

    await db.doc(this.getAppDocPath(uid, appId)).set(
      { _operational: { validationMeta } },
      { merge: true },
    );
  }

  /** Get validation results */
  async get(uid: string, appId: string): Promise<ValidationResults | null> {
    try {
      const db = getFirestore();
      const doc = await db.doc(this.getDocPath(uid, appId)).get();
      if (!doc.exists) return null;
      return doc.data() as ValidationResults;
    } catch (error) {
      console.error('[ValidationStore] Error getting validation results:', error);
      return null;
    }
  }

  /** Clear validation results */
  async clear(uid: string, appId: string): Promise<void> {
    const db = getFirestore();
    const { FieldValue } = await import('firebase-admin/firestore');

    await db.doc(this.getDocPath(uid, appId)).delete();

    await db.doc(this.getAppDocPath(uid, appId)).update({
      '_operational.validationMeta': FieldValue.delete(),
    });
  }
}
