/**
 * SnapshotStore - Firestore CRUD for schema snapshots
 *
 * Snapshots are full copies of the schema at a point in time,
 * stored in subcollection: users/{uid}/apps/{appId}/snapshots/{snapshotId}
 */
import type { OrbitalSchema, SnapshotDocument } from '@almadar/core';
export declare class SnapshotStore {
    private appsCollection;
    constructor(appsCollection?: string);
    private getCollectionPath;
    private getAppDocPath;
    /** Create a snapshot of the current schema */
    create(uid: string, appId: string, schema: OrbitalSchema, reason: string): Promise<string>;
    /** Get all snapshots for an app (ordered by timestamp desc) */
    getAll(uid: string, appId: string): Promise<SnapshotDocument[]>;
    /** Get a specific snapshot by ID */
    get(uid: string, appId: string, snapshotId: string): Promise<SnapshotDocument | null>;
    /** Delete a snapshot */
    delete(uid: string, appId: string, snapshotId: string): Promise<boolean>;
    /** Get schema snapshot at a specific version */
    getByVersion(uid: string, appId: string, version: number): Promise<OrbitalSchema | null>;
    /** Get the schema from a snapshot (deserialized) */
    getSchemaFromSnapshot(snapshot: SnapshotDocument): OrbitalSchema;
}
//# sourceMappingURL=SnapshotStore.d.ts.map