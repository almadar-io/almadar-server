/**
 * SchemaStore - Firestore CRUD for OrbitalSchema documents
 *
 * Handles schema get/save/create/delete/list with caching
 * and Firestore serialization.
 */

import type { OrbitalSchema, StatsView, AppSummary, SaveOptions, SaveResult } from '@almadar/core';
import { getFirestore } from '../lib/db.js';
import { toFirestoreFormat, fromFirestoreFormat, type FirestoreSchemaDoc } from './firestoreFormat.js';
import { SchemaProtectionService } from './SchemaProtectionService.js';
import type { SnapshotStore } from './SnapshotStore.js';

const SCHEMA_CACHE_TTL_MS = 60_000;
const LIST_CACHE_TTL_MS = 30_000;

export class SchemaStore {
  private appsCollection: string;
  private schemaCache = new Map<string, { schema: OrbitalSchema; timestamp: number }>();
  private listCache = new Map<string, { apps: AppSummary[]; timestamp: number }>();
  private protectionService = new SchemaProtectionService();
  private snapshotStore: SnapshotStore | null = null;

  constructor(appsCollection = 'apps') {
    this.appsCollection = appsCollection;
  }

  /** Set snapshot store for auto-snapshot on destructive saves */
  setSnapshotStore(store: SnapshotStore): void {
    this.snapshotStore = store;
  }

  /** Get a schema by app ID */
  async get(uid: string, appId: string): Promise<OrbitalSchema | null> {
    const cacheKey = `${uid}:${appId}`;
    const cached = this.schemaCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < SCHEMA_CACHE_TTL_MS) {
      return cached.schema;
    }

    try {
      const db = getFirestore();
      const appDoc = await db.doc(`users/${uid}/${this.appsCollection}/${appId}`).get();

      if (!appDoc.exists) return null;

      const data = appDoc.data() as FirestoreSchemaDoc;
      const hasOrbitals = data['orbitals'] || data._orbitalsJson;
      if (!data.name || !hasOrbitals) return null;

      const schema = fromFirestoreFormat(data);
      this.schemaCache.set(cacheKey, { schema, timestamp: Date.now() });
      return schema;
    } catch (error) {
      console.error('[SchemaStore] Error fetching schema:', error);
      return null;
    }
  }

  /**
   * Save a schema (create or full replace).
   *
   * Features:
   * - Detects destructive changes (removals)
   * - Requires confirmation for critical removals
   * - Auto-creates snapshots before destructive changes (if SnapshotStore attached)
   */
  async save(
    uid: string,
    appId: string,
    schema: OrbitalSchema,
    options: SaveOptions = {},
  ): Promise<SaveResult> {
    try {
      const existingSchema = await this.get(uid, appId);
      let snapshotId: string | undefined;

      // Create snapshot if snapshotReason provided
      if (existingSchema && options.snapshotReason && this.snapshotStore) {
        snapshotId = await this.snapshotStore.create(uid, appId, existingSchema, options.snapshotReason);
      }

      // Check for destructive changes (unless skipProtection)
      if (existingSchema && !options.skipProtection) {
        const comparison = this.protectionService.compareSchemas(existingSchema, schema);

        if (comparison.isDestructive) {
          const { removals } = comparison;
          const hasCriticalRemovals = this.protectionService.requiresConfirmation(removals);
          const hasContentReductions = this.protectionService.hasSignificantContentReduction(
            removals.pageContentReductions,
          );

          if ((hasCriticalRemovals || hasContentReductions) && !options.confirmRemovals) {
            return {
              success: false,
              requiresConfirmation: true,
              removals: comparison.removals,
              error: hasContentReductions
                ? 'Page content reduction detected - confirmation required'
                : 'Confirmation required for critical removals',
            };
          }

          // Auto-snapshot before destructive change
          if (
            !snapshotId &&
            this.snapshotStore &&
            (removals.critical.length > 0 || removals.pageContentReductions.length > 0)
          ) {
            snapshotId = await this.snapshotStore.create(
              uid,
              appId,
              existingSchema,
              `auto_before_removal_${Date.now()}`,
            );
          }
        }
      }

      const firestoreData = toFirestoreFormat(schema);
      const now = Date.now();
      const docData = {
        ...firestoreData,
        _metadata: {
          version: options.expectedVersion ? options.expectedVersion + 1 : 1,
          updatedAt: now,
          createdAt: existingSchema ? undefined : now,
          source: options.source || 'manual',
        },
      };

      const db = getFirestore();
      await db.doc(`users/${uid}/${this.appsCollection}/${appId}`).set(docData, { merge: true });

      this.invalidateCache(uid, appId);
      return { success: true, snapshotId };
    } catch (error) {
      console.error('[SchemaStore] Error saving schema:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /** Create a new app with initial schema */
  async create(
    uid: string,
    metadata: { name: string; description?: string },
  ): Promise<{ appId: string; schema: OrbitalSchema }> {
    const appId = `app-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const now = Date.now();

    const schema: OrbitalSchema = {
      name: metadata.name,
      description: metadata.description,
      orbitals: [],
    };

    const firestoreData = toFirestoreFormat(schema);
    const docData = {
      ...firestoreData,
      _metadata: { version: 1, createdAt: now, updatedAt: now, source: 'manual' as const },
    };

    const db = getFirestore();
    await db.doc(`users/${uid}/${this.appsCollection}/${appId}`).set(docData);
    this.listCache.delete(uid);

    return { appId, schema };
  }

  /** Delete an app */
  async delete(uid: string, appId: string): Promise<boolean> {
    try {
      const db = getFirestore();
      const ref = db.doc(`users/${uid}/${this.appsCollection}/${appId}`);
      const doc = await ref.get();
      if (!doc.exists) return false;

      await ref.delete();
      this.invalidateCache(uid, appId);
      return true;
    } catch (error) {
      console.error('[SchemaStore] Error deleting app:', error);
      return false;
    }
  }

  /** List all apps for a user */
  async list(uid: string): Promise<AppSummary[]> {
    const cached = this.listCache.get(uid);
    if (cached && Date.now() - cached.timestamp < LIST_CACHE_TTL_MS) {
      return cached.apps;
    }

    try {
      const db = getFirestore();
      const snapshot = await db
        .collection(`users/${uid}/${this.appsCollection}`)
        .select('name', 'description', 'domainContext', '_metadata', 'orbitalCount', 'traitCount')
        .orderBy('_metadata.updatedAt', 'desc')
        .get();

      const apps: AppSummary[] = snapshot.docs.map((doc) => {
        const data = doc.data();
        const metadata = data._metadata as { version?: number; createdAt?: number; updatedAt?: number } | undefined;
        const orbitalCount = data.orbitalCount as number | undefined;

        return {
          id: doc.id,
          name: (data.name as string) || 'Untitled',
          description: data.description as string | undefined,
          updatedAt: metadata?.updatedAt || Date.now(),
          createdAt: metadata?.createdAt || Date.now(),
          stats: { entities: orbitalCount ?? 0, pages: 0, states: 0, events: 0, transitions: 0 },
          domainContext: data.domainContext as string | undefined,
          hasValidationErrors: false,
        };
      });

      this.listCache.set(uid, { apps, timestamp: Date.now() });
      return apps;
    } catch (error) {
      console.error('[SchemaStore] Error listing apps:', error);
      return [];
    }
  }

  /** Compute stats from OrbitalSchema */
  computeStats(schema: OrbitalSchema): StatsView {
    const orbitals = schema.orbitals || [];
    const entities = orbitals.length;
    const pages = orbitals.reduce((n, o) => n + (o.pages?.length || 0), 0);

    // Gather traits from both schema-level and orbital-level
    interface TraitWithSM { stateMachine?: { states?: unknown[]; events?: unknown[]; transitions?: unknown[] } }
    const schemaLevelTraits = ((schema as { traits?: unknown[] }).traits ?? []) as TraitWithSM[];
    const orbitalTraits = orbitals.flatMap((o) =>
      (o.traits || []).filter((t) => typeof t === 'object' && t !== null && !('ref' in t) && 'stateMachine' in t),
    ) as TraitWithSM[];
    const allTraits: TraitWithSM[] = [...schemaLevelTraits, ...orbitalTraits];

    return {
      states: allTraits.flatMap((t) => t.stateMachine?.states || []).length,
      events: allTraits.flatMap((t) => t.stateMachine?.events || []).length,
      pages,
      entities,
      transitions: allTraits.flatMap((t) => t.stateMachine?.transitions || []).length,
    };
  }

  /** Invalidate caches for a specific app */
  invalidateCache(uid: string, appId: string): void {
    this.schemaCache.delete(`${uid}:${appId}`);
    this.listCache.delete(uid);
  }

  /** Clear all caches */
  clearCaches(): void {
    this.schemaCache.clear();
    this.listCache.clear();
  }

  /** Get the collection path for an app */
  getAppDocPath(uid: string, appId: string): string {
    return `users/${uid}/${this.appsCollection}/${appId}`;
  }

  /** Expose apps collection name for subcollection stores */
  getAppsCollection(): string {
    return this.appsCollection;
  }
}
