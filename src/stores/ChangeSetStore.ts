/**
 * ChangeSetStore - Firestore CRUD for schema changesets
 *
 * Changesets track changes made to the schema over time,
 * stored in subcollection: users/{uid}/apps/{appId}/changesets/{changeSetId}
 */

import type { ChangeSetDocument, HistoryMeta } from '@almadar/core';
import { getFirestore } from '../lib/db.js';

const CHANGESETS_COLLECTION = 'changesets';

export class ChangeSetStore {
  private appsCollection: string;

  constructor(appsCollection = 'apps') {
    this.appsCollection = appsCollection;
  }

  private getCollectionPath(uid: string, appId: string): string {
    return `users/${uid}/${this.appsCollection}/${appId}/${CHANGESETS_COLLECTION}`;
  }

  private getAppDocPath(uid: string, appId: string): string {
    return `users/${uid}/${this.appsCollection}/${appId}`;
  }

  /** Append a changeset to history */
  async append(uid: string, appId: string, changeSet: ChangeSetDocument): Promise<void> {
    const db = getFirestore();

    await db.doc(`${this.getCollectionPath(uid, appId)}/${changeSet.id}`).set(changeSet);

    // Update history metadata
    const appDocRef = db.doc(this.getAppDocPath(uid, appId));
    const appDoc = await appDocRef.get();
    const currentMeta = appDoc.data()?._historyMeta as HistoryMeta | undefined;

    const updatedMeta: HistoryMeta = {
      latestSnapshotId: currentMeta?.latestSnapshotId,
      latestChangeSetId: changeSet.id,
      snapshotCount: currentMeta?.snapshotCount || 0,
      changeSetCount: (currentMeta?.changeSetCount || 0) + 1,
    };

    await appDocRef.set({ _historyMeta: updatedMeta }, { merge: true });
  }

  /** Get change history for an app (ordered by version desc) */
  async getHistory(uid: string, appId: string): Promise<ChangeSetDocument[]> {
    try {
      const db = getFirestore();
      const query = await db
        .collection(this.getCollectionPath(uid, appId))
        .orderBy('version', 'desc')
        .get();

      return query.docs.map((doc) => doc.data() as ChangeSetDocument);
    } catch (error) {
      console.error('[ChangeSetStore] Error getting change history:', error);
      return [];
    }
  }

  /** Get a specific changeset by ID */
  async get(uid: string, appId: string, changeSetId: string): Promise<ChangeSetDocument | null> {
    const db = getFirestore();
    const doc = await db.doc(`${this.getCollectionPath(uid, appId)}/${changeSetId}`).get();
    if (!doc.exists) return null;
    return doc.data() as ChangeSetDocument;
  }

  /** Update a changeset's status */
  async updateStatus(
    uid: string,
    appId: string,
    changeSetId: string,
    status: 'applied' | 'reverted' | 'pending',
  ): Promise<void> {
    const db = getFirestore();
    const ref = db.doc(`${this.getCollectionPath(uid, appId)}/${changeSetId}`);
    const doc = await ref.get();
    if (!doc.exists) return;
    await ref.update({ status });
  }

  /** Delete a changeset */
  async delete(uid: string, appId: string, changeSetId: string): Promise<boolean> {
    const db = getFirestore();
    const ref = db.doc(`${this.getCollectionPath(uid, appId)}/${changeSetId}`);
    const doc = await ref.get();
    if (!doc.exists) return false;

    await ref.delete();

    // Update history metadata
    const appDocRef = db.doc(this.getAppDocPath(uid, appId));
    const appDoc = await appDocRef.get();
    const currentMeta = appDoc.data()?._historyMeta as HistoryMeta | undefined;

    if (currentMeta) {
      const updatedMeta: HistoryMeta = {
        ...currentMeta,
        changeSetCount: Math.max(0, (currentMeta.changeSetCount || 1) - 1),
        latestChangeSetId:
          currentMeta.latestChangeSetId === changeSetId ? undefined : currentMeta.latestChangeSetId,
      };
      await appDocRef.set({ _historyMeta: updatedMeta }, { merge: true });
    }

    return true;
  }
}
