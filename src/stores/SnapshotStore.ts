/**
 * SnapshotStore - Firestore CRUD for schema snapshots
 *
 * Snapshots are full copies of the schema at a point in time,
 * stored in subcollection: users/{uid}/apps/{appId}/snapshots/{snapshotId}
 */

import type { OrbitalSchema, SnapshotDocument, HistoryMeta } from '@almadar/core';
import { getFirestore } from '../lib/db.js';
import { toFirestoreFormat, fromFirestoreFormat } from './firestoreFormat.js';

const SNAPSHOTS_COLLECTION = 'snapshots';

export class SnapshotStore {
  private appsCollection: string;

  constructor(appsCollection = 'apps') {
    this.appsCollection = appsCollection;
  }

  private getCollectionPath(uid: string, appId: string): string {
    return `users/${uid}/${this.appsCollection}/${appId}/${SNAPSHOTS_COLLECTION}`;
  }

  private getAppDocPath(uid: string, appId: string): string {
    return `users/${uid}/${this.appsCollection}/${appId}`;
  }

  /** Create a snapshot of the current schema */
  async create(
    uid: string,
    appId: string,
    schema: OrbitalSchema,
    reason: string,
  ): Promise<string> {
    const db = getFirestore();
    const snapshotId = `snapshot_${Date.now()}`;

    const snapshotDoc: SnapshotDocument = {
      id: snapshotId,
      timestamp: Date.now(),
      schema: toFirestoreFormat(schema),
      reason,
    };

    await db.doc(`${this.getCollectionPath(uid, appId)}/${snapshotId}`).set(snapshotDoc);

    // Update history metadata
    const appDocRef = db.doc(this.getAppDocPath(uid, appId));
    const appDoc = await appDocRef.get();
    const currentMeta = appDoc.data()?._historyMeta as HistoryMeta | undefined;

    const updatedMeta: HistoryMeta = {
      latestSnapshotId: snapshotId,
      latestChangeSetId: currentMeta?.latestChangeSetId,
      snapshotCount: (currentMeta?.snapshotCount || 0) + 1,
      changeSetCount: currentMeta?.changeSetCount || 0,
    };

    await appDocRef.set({ _historyMeta: updatedMeta }, { merge: true });
    return snapshotId;
  }

  /** Get all snapshots for an app (ordered by timestamp desc) */
  async getAll(uid: string, appId: string): Promise<SnapshotDocument[]> {
    const db = getFirestore();
    const query = await db
      .collection(this.getCollectionPath(uid, appId))
      .orderBy('timestamp', 'desc')
      .get();

    return query.docs.map((doc) => doc.data() as SnapshotDocument);
  }

  /** Get a specific snapshot by ID */
  async get(uid: string, appId: string, snapshotId: string): Promise<SnapshotDocument | null> {
    const db = getFirestore();
    const doc = await db.doc(`${this.getCollectionPath(uid, appId)}/${snapshotId}`).get();
    if (!doc.exists) return null;
    return doc.data() as SnapshotDocument;
  }

  /** Delete a snapshot */
  async delete(uid: string, appId: string, snapshotId: string): Promise<boolean> {
    const db = getFirestore();
    const ref = db.doc(`${this.getCollectionPath(uid, appId)}/${snapshotId}`);
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
        snapshotCount: Math.max(0, (currentMeta.snapshotCount || 1) - 1),
        latestSnapshotId:
          currentMeta.latestSnapshotId === snapshotId ? undefined : currentMeta.latestSnapshotId,
      };
      await appDocRef.set({ _historyMeta: updatedMeta }, { merge: true });
    }

    return true;
  }

  /** Get schema snapshot at a specific version */
  async getByVersion(uid: string, appId: string, version: number): Promise<OrbitalSchema | null> {
    const db = getFirestore();
    const query = await db
      .collection(this.getCollectionPath(uid, appId))
      .where('version', '==', version)
      .limit(1)
      .get();

    if (query.empty) return null;
    const snapshot = query.docs[0].data() as SnapshotDocument;
    return fromFirestoreFormat(snapshot.schema as Record<string, unknown>);
  }

  /** Get the schema from a snapshot (deserialized) */
  getSchemaFromSnapshot(snapshot: SnapshotDocument): OrbitalSchema {
    return fromFirestoreFormat(snapshot.schema as Record<string, unknown>);
  }
}
