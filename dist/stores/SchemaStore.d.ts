/**
 * SchemaStore - Firestore CRUD for OrbitalSchema documents
 *
 * Handles schema get/save/create/delete/list with caching
 * and Firestore serialization.
 */
import type { OrbitalSchema, StatsView, AppSummary, SaveOptions, SaveResult } from '@almadar/core';
import type { SnapshotStore } from './SnapshotStore.js';
export declare class SchemaStore {
    private appsCollection;
    private schemaCache;
    private listCache;
    private protectionService;
    private snapshotStore;
    constructor(appsCollection?: string);
    /** Set snapshot store for auto-snapshot on destructive saves */
    setSnapshotStore(store: SnapshotStore): void;
    /** Get a schema by app ID */
    get(uid: string, appId: string): Promise<OrbitalSchema | null>;
    /**
     * Save a schema (create or full replace).
     *
     * Features:
     * - Detects destructive changes (removals)
     * - Requires confirmation for critical removals
     * - Auto-creates snapshots before destructive changes (if SnapshotStore attached)
     */
    save(uid: string, appId: string, schema: OrbitalSchema, options?: SaveOptions): Promise<SaveResult>;
    /** Create a new app with initial schema */
    create(uid: string, metadata: {
        name: string;
        description?: string;
    }): Promise<{
        appId: string;
        schema: OrbitalSchema;
    }>;
    /** Delete an app */
    delete(uid: string, appId: string): Promise<boolean>;
    /** List all apps for a user */
    list(uid: string): Promise<AppSummary[]>;
    /** Compute stats from OrbitalSchema */
    computeStats(schema: OrbitalSchema): StatsView;
    /** Invalidate caches for a specific app */
    invalidateCache(uid: string, appId: string): void;
    /** Clear all caches */
    clearCaches(): void;
    /** Get the collection path for an app */
    getAppDocPath(uid: string, appId: string): string;
    /** Expose apps collection name for subcollection stores */
    getAppsCollection(): string;
}
//# sourceMappingURL=SchemaStore.d.ts.map