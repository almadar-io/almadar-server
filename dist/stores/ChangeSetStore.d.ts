/**
 * ChangeSetStore - Firestore CRUD for schema changesets
 *
 * Changesets track changes made to the schema over time,
 * stored in subcollection: users/{uid}/apps/{appId}/changesets/{changeSetId}
 */
import type { ChangeSetDocument } from '@almadar/core';
export declare class ChangeSetStore {
    private appsCollection;
    constructor(appsCollection?: string);
    private getCollectionPath;
    private getAppDocPath;
    /** Append a changeset to history */
    append(uid: string, appId: string, changeSet: ChangeSetDocument): Promise<void>;
    /** Get change history for an app (ordered by version desc) */
    getHistory(uid: string, appId: string): Promise<ChangeSetDocument[]>;
    /** Get a specific changeset by ID */
    get(uid: string, appId: string, changeSetId: string): Promise<ChangeSetDocument | null>;
    /** Update a changeset's status */
    updateStatus(uid: string, appId: string, changeSetId: string, status: 'applied' | 'reverted' | 'pending'): Promise<void>;
    /** Delete a changeset */
    delete(uid: string, appId: string, changeSetId: string): Promise<boolean>;
}
//# sourceMappingURL=ChangeSetStore.d.ts.map