import admin from 'firebase-admin';
import { diffSchemas, categorizeRemovals, detectPageContentReduction, isDestructiveChange, hasSignificantPageReduction, requiresConfirmation } from '@almadar/core';

// src/stores/firestoreFormat.ts
function toFirestoreFormat(schema) {
  const data = { ...schema };
  if (schema.orbitals) {
    data._orbitalsJson = JSON.stringify(schema.orbitals);
    data.orbitalCount = schema.orbitals.length;
    delete data.orbitals;
  }
  if (data.traits) {
    const traits = data.traits;
    data._traitsJson = JSON.stringify(traits);
    data.traitCount = traits.length;
    delete data.traits;
  }
  if (schema.services) {
    data._servicesJson = JSON.stringify(schema.services);
    data.serviceCount = schema.services.length;
    delete data.services;
  }
  return data;
}
function fromFirestoreFormat(data) {
  const result = { ...data };
  if (result._orbitalsJson && typeof result._orbitalsJson === "string") {
    try {
      result.orbitals = JSON.parse(result._orbitalsJson);
      delete result._orbitalsJson;
      delete result.orbitalCount;
    } catch (e) {
      console.warn("[OrbitalStore] Failed to parse _orbitalsJson:", e);
      result.orbitals = [];
    }
  }
  if (result._traitsJson && typeof result._traitsJson === "string") {
    try {
      result.traits = JSON.parse(result._traitsJson);
      delete result._traitsJson;
      delete result.traitCount;
    } catch (e) {
      console.warn("[OrbitalStore] Failed to parse _traitsJson:", e);
    }
  }
  if (result._servicesJson && typeof result._servicesJson === "string") {
    try {
      result.services = JSON.parse(result._servicesJson);
      delete result._servicesJson;
      delete result.serviceCount;
    } catch (e) {
      console.warn("[OrbitalStore] Failed to parse _servicesJson:", e);
    }
  }
  return result;
}
function getApp() {
  if (admin.apps.length === 0) {
    throw new Error(
      "@almadar/server: Firebase Admin SDK is not initialized. Call initializeFirebase() or admin.initializeApp() before using @almadar/server."
    );
  }
  return admin.app();
}
function getFirestore() {
  return getApp().firestore();
}
new Proxy({}, {
  get(_target, prop, receiver) {
    const firestore = getFirestore();
    const value = Reflect.get(firestore, prop, receiver);
    return typeof value === "function" ? value.bind(firestore) : value;
  }
});
var SchemaProtectionService = class {
  /**
   * Compare two schemas and detect destructive changes.
   *
   * Returns categorized removals including page content reductions.
   */
  compareSchemas(before, after) {
    const changeSet = diffSchemas(before, after);
    const removals = categorizeRemovals(changeSet);
    const beforePages = before.orbitals?.flatMap((o) => o.pages || []) || [];
    const afterPages = after.orbitals?.flatMap((o) => o.pages || []) || [];
    const pageContentReductions = detectPageContentReduction(beforePages, afterPages);
    removals.pageContentReductions = pageContentReductions;
    const isDestructive = isDestructiveChange(changeSet) || hasSignificantPageReduction(pageContentReductions);
    return { isDestructive, removals };
  }
  /** Check if critical removals require confirmation */
  requiresConfirmation(removals) {
    return requiresConfirmation(removals);
  }
  /** Check for significant page content reductions */
  hasSignificantContentReduction(reductions) {
    return hasSignificantPageReduction(reductions);
  }
};

// src/stores/SchemaStore.ts
var SCHEMA_CACHE_TTL_MS = 6e4;
var LIST_CACHE_TTL_MS = 3e4;
var SchemaStore = class {
  appsCollection;
  schemaCache = /* @__PURE__ */ new Map();
  listCache = /* @__PURE__ */ new Map();
  protectionService = new SchemaProtectionService();
  snapshotStore = null;
  constructor(appsCollection = "apps") {
    this.appsCollection = appsCollection;
  }
  /** Set snapshot store for auto-snapshot on destructive saves */
  setSnapshotStore(store) {
    this.snapshotStore = store;
  }
  /** Get a schema by app ID */
  async get(uid, appId) {
    const cacheKey = `${uid}:${appId}`;
    const cached = this.schemaCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < SCHEMA_CACHE_TTL_MS) {
      return cached.schema;
    }
    try {
      const db2 = getFirestore();
      const appDoc = await db2.doc(`users/${uid}/${this.appsCollection}/${appId}`).get();
      if (!appDoc.exists) return null;
      const data = appDoc.data();
      const hasOrbitals = data.orbitals || data._orbitalsJson;
      if (!data.name || !hasOrbitals) return null;
      const schema = fromFirestoreFormat(data);
      this.schemaCache.set(cacheKey, { schema, timestamp: Date.now() });
      return schema;
    } catch (error) {
      console.error("[SchemaStore] Error fetching schema:", error);
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
  async save(uid, appId, schema, options = {}) {
    try {
      const existingSchema = await this.get(uid, appId);
      let snapshotId;
      if (existingSchema && options.snapshotReason && this.snapshotStore) {
        snapshotId = await this.snapshotStore.create(uid, appId, existingSchema, options.snapshotReason);
      }
      if (existingSchema && !options.skipProtection) {
        const comparison = this.protectionService.compareSchemas(existingSchema, schema);
        if (comparison.isDestructive) {
          const { removals } = comparison;
          const hasCriticalRemovals = this.protectionService.requiresConfirmation(removals);
          const hasContentReductions = this.protectionService.hasSignificantContentReduction(
            removals.pageContentReductions
          );
          if ((hasCriticalRemovals || hasContentReductions) && !options.confirmRemovals) {
            return {
              success: false,
              requiresConfirmation: true,
              removals: comparison.removals,
              error: hasContentReductions ? "Page content reduction detected - confirmation required" : "Confirmation required for critical removals"
            };
          }
          if (!snapshotId && this.snapshotStore && (removals.critical.length > 0 || removals.pageContentReductions.length > 0)) {
            snapshotId = await this.snapshotStore.create(
              uid,
              appId,
              existingSchema,
              `auto_before_removal_${Date.now()}`
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
          createdAt: existingSchema ? void 0 : now,
          source: options.source || "manual"
        }
      };
      const db2 = getFirestore();
      await db2.doc(`users/${uid}/${this.appsCollection}/${appId}`).set(docData, { merge: true });
      this.invalidateCache(uid, appId);
      return { success: true, snapshotId };
    } catch (error) {
      console.error("[SchemaStore] Error saving schema:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error"
      };
    }
  }
  /** Create a new app with initial schema */
  async create(uid, metadata) {
    const appId = `app-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const now = Date.now();
    const schema = {
      name: metadata.name,
      description: metadata.description,
      orbitals: []
    };
    const firestoreData = toFirestoreFormat(schema);
    const docData = {
      ...firestoreData,
      _metadata: { version: 1, createdAt: now, updatedAt: now, source: "manual" }
    };
    const db2 = getFirestore();
    await db2.doc(`users/${uid}/${this.appsCollection}/${appId}`).set(docData);
    this.listCache.delete(uid);
    return { appId, schema };
  }
  /** Delete an app */
  async delete(uid, appId) {
    try {
      const db2 = getFirestore();
      const ref = db2.doc(`users/${uid}/${this.appsCollection}/${appId}`);
      const doc = await ref.get();
      if (!doc.exists) return false;
      await ref.delete();
      this.invalidateCache(uid, appId);
      return true;
    } catch (error) {
      console.error("[SchemaStore] Error deleting app:", error);
      return false;
    }
  }
  /** List all apps for a user */
  async list(uid) {
    const cached = this.listCache.get(uid);
    if (cached && Date.now() - cached.timestamp < LIST_CACHE_TTL_MS) {
      return cached.apps;
    }
    try {
      const db2 = getFirestore();
      const snapshot = await db2.collection(`users/${uid}/${this.appsCollection}`).select("name", "description", "domainContext", "_metadata", "orbitalCount", "traitCount").orderBy("_metadata.updatedAt", "desc").get();
      const apps = snapshot.docs.map((doc) => {
        const data = doc.data();
        const metadata = data._metadata;
        const orbitalCount = data.orbitalCount;
        return {
          id: doc.id,
          name: data.name || "Untitled",
          description: data.description,
          updatedAt: metadata?.updatedAt || Date.now(),
          createdAt: metadata?.createdAt || Date.now(),
          stats: { entities: orbitalCount ?? 0, pages: 0, states: 0, events: 0, transitions: 0 },
          domainContext: data.domainContext,
          hasValidationErrors: false
        };
      });
      this.listCache.set(uid, { apps, timestamp: Date.now() });
      return apps;
    } catch (error) {
      console.error("[SchemaStore] Error listing apps:", error);
      return [];
    }
  }
  /** Compute stats from OrbitalSchema */
  computeStats(schema) {
    const orbitals = schema.orbitals || [];
    const entities = orbitals.length;
    const pages = orbitals.reduce((n, o) => n + (o.pages?.length || 0), 0);
    const allTraits = [
      ...schema.traits || [],
      ...orbitals.flatMap(
        (o) => (o.traits || []).filter((t) => typeof t !== "string" && "stateMachine" in t)
      )
    ];
    return {
      states: allTraits.flatMap((t) => t.stateMachine?.states || []).length,
      events: allTraits.flatMap((t) => t.stateMachine?.events || []).length,
      pages,
      entities,
      transitions: allTraits.flatMap((t) => t.stateMachine?.transitions || []).length
    };
  }
  /** Invalidate caches for a specific app */
  invalidateCache(uid, appId) {
    this.schemaCache.delete(`${uid}:${appId}`);
    this.listCache.delete(uid);
  }
  /** Clear all caches */
  clearCaches() {
    this.schemaCache.clear();
    this.listCache.clear();
  }
  /** Get the collection path for an app */
  getAppDocPath(uid, appId) {
    return `users/${uid}/${this.appsCollection}/${appId}`;
  }
  /** Expose apps collection name for subcollection stores */
  getAppsCollection() {
    return this.appsCollection;
  }
};

// src/stores/SnapshotStore.ts
var SNAPSHOTS_COLLECTION = "snapshots";
var SnapshotStore = class {
  appsCollection;
  constructor(appsCollection = "apps") {
    this.appsCollection = appsCollection;
  }
  getCollectionPath(uid, appId) {
    return `users/${uid}/${this.appsCollection}/${appId}/${SNAPSHOTS_COLLECTION}`;
  }
  getAppDocPath(uid, appId) {
    return `users/${uid}/${this.appsCollection}/${appId}`;
  }
  /** Create a snapshot of the current schema */
  async create(uid, appId, schema, reason) {
    const db2 = getFirestore();
    const snapshotId = `snapshot_${Date.now()}`;
    const snapshotDoc = {
      id: snapshotId,
      timestamp: Date.now(),
      schema: toFirestoreFormat(schema),
      reason
    };
    await db2.doc(`${this.getCollectionPath(uid, appId)}/${snapshotId}`).set(snapshotDoc);
    const appDocRef = db2.doc(this.getAppDocPath(uid, appId));
    const appDoc = await appDocRef.get();
    const currentMeta = appDoc.data()?._historyMeta;
    const updatedMeta = {
      latestSnapshotId: snapshotId,
      latestChangeSetId: currentMeta?.latestChangeSetId,
      snapshotCount: (currentMeta?.snapshotCount || 0) + 1,
      changeSetCount: currentMeta?.changeSetCount || 0
    };
    await appDocRef.set({ _historyMeta: updatedMeta }, { merge: true });
    return snapshotId;
  }
  /** Get all snapshots for an app (ordered by timestamp desc) */
  async getAll(uid, appId) {
    const db2 = getFirestore();
    const query = await db2.collection(this.getCollectionPath(uid, appId)).orderBy("timestamp", "desc").get();
    return query.docs.map((doc) => doc.data());
  }
  /** Get a specific snapshot by ID */
  async get(uid, appId, snapshotId) {
    const db2 = getFirestore();
    const doc = await db2.doc(`${this.getCollectionPath(uid, appId)}/${snapshotId}`).get();
    if (!doc.exists) return null;
    return doc.data();
  }
  /** Delete a snapshot */
  async delete(uid, appId, snapshotId) {
    const db2 = getFirestore();
    const ref = db2.doc(`${this.getCollectionPath(uid, appId)}/${snapshotId}`);
    const doc = await ref.get();
    if (!doc.exists) return false;
    await ref.delete();
    const appDocRef = db2.doc(this.getAppDocPath(uid, appId));
    const appDoc = await appDocRef.get();
    const currentMeta = appDoc.data()?._historyMeta;
    if (currentMeta) {
      const updatedMeta = {
        ...currentMeta,
        snapshotCount: Math.max(0, (currentMeta.snapshotCount || 1) - 1),
        latestSnapshotId: currentMeta.latestSnapshotId === snapshotId ? void 0 : currentMeta.latestSnapshotId
      };
      await appDocRef.set({ _historyMeta: updatedMeta }, { merge: true });
    }
    return true;
  }
  /** Get schema snapshot at a specific version */
  async getByVersion(uid, appId, version) {
    const db2 = getFirestore();
    const query = await db2.collection(this.getCollectionPath(uid, appId)).where("version", "==", version).limit(1).get();
    if (query.empty) return null;
    const snapshot = query.docs[0].data();
    return fromFirestoreFormat(snapshot.schema);
  }
  /** Get the schema from a snapshot (deserialized) */
  getSchemaFromSnapshot(snapshot) {
    return fromFirestoreFormat(snapshot.schema);
  }
};

// src/stores/ChangeSetStore.ts
var CHANGESETS_COLLECTION = "changesets";
var ChangeSetStore = class {
  appsCollection;
  constructor(appsCollection = "apps") {
    this.appsCollection = appsCollection;
  }
  getCollectionPath(uid, appId) {
    return `users/${uid}/${this.appsCollection}/${appId}/${CHANGESETS_COLLECTION}`;
  }
  getAppDocPath(uid, appId) {
    return `users/${uid}/${this.appsCollection}/${appId}`;
  }
  /** Append a changeset to history */
  async append(uid, appId, changeSet) {
    const db2 = getFirestore();
    await db2.doc(`${this.getCollectionPath(uid, appId)}/${changeSet.id}`).set(changeSet);
    const appDocRef = db2.doc(this.getAppDocPath(uid, appId));
    const appDoc = await appDocRef.get();
    const currentMeta = appDoc.data()?._historyMeta;
    const updatedMeta = {
      latestSnapshotId: currentMeta?.latestSnapshotId,
      latestChangeSetId: changeSet.id,
      snapshotCount: currentMeta?.snapshotCount || 0,
      changeSetCount: (currentMeta?.changeSetCount || 0) + 1
    };
    await appDocRef.set({ _historyMeta: updatedMeta }, { merge: true });
  }
  /** Get change history for an app (ordered by version desc) */
  async getHistory(uid, appId) {
    try {
      const db2 = getFirestore();
      const query = await db2.collection(this.getCollectionPath(uid, appId)).orderBy("version", "desc").get();
      return query.docs.map((doc) => doc.data());
    } catch (error) {
      console.error("[ChangeSetStore] Error getting change history:", error);
      return [];
    }
  }
  /** Get a specific changeset by ID */
  async get(uid, appId, changeSetId) {
    const db2 = getFirestore();
    const doc = await db2.doc(`${this.getCollectionPath(uid, appId)}/${changeSetId}`).get();
    if (!doc.exists) return null;
    return doc.data();
  }
  /** Update a changeset's status */
  async updateStatus(uid, appId, changeSetId, status) {
    const db2 = getFirestore();
    const ref = db2.doc(`${this.getCollectionPath(uid, appId)}/${changeSetId}`);
    const doc = await ref.get();
    if (!doc.exists) return;
    await ref.update({ status });
  }
  /** Delete a changeset */
  async delete(uid, appId, changeSetId) {
    const db2 = getFirestore();
    const ref = db2.doc(`${this.getCollectionPath(uid, appId)}/${changeSetId}`);
    const doc = await ref.get();
    if (!doc.exists) return false;
    await ref.delete();
    const appDocRef = db2.doc(this.getAppDocPath(uid, appId));
    const appDoc = await appDocRef.get();
    const currentMeta = appDoc.data()?._historyMeta;
    if (currentMeta) {
      const updatedMeta = {
        ...currentMeta,
        changeSetCount: Math.max(0, (currentMeta.changeSetCount || 1) - 1),
        latestChangeSetId: currentMeta.latestChangeSetId === changeSetId ? void 0 : currentMeta.latestChangeSetId
      };
      await appDocRef.set({ _historyMeta: updatedMeta }, { merge: true });
    }
    return true;
  }
};

// src/stores/ValidationStore.ts
var VALIDATION_COLLECTION = "validation";
var VALIDATION_DOC_ID = "current";
var ValidationStore = class {
  appsCollection;
  constructor(appsCollection = "apps") {
    this.appsCollection = appsCollection;
  }
  getDocPath(uid, appId) {
    return `users/${uid}/${this.appsCollection}/${appId}/${VALIDATION_COLLECTION}/${VALIDATION_DOC_ID}`;
  }
  getAppDocPath(uid, appId) {
    return `users/${uid}/${this.appsCollection}/${appId}`;
  }
  /** Save validation results */
  async save(uid, appId, results) {
    const db2 = getFirestore();
    await db2.doc(this.getDocPath(uid, appId)).set(results);
    const validationMeta = {
      errorCount: results.errors?.length || 0,
      warningCount: results.warnings?.length || 0,
      validatedAt: results.validatedAt
    };
    await db2.doc(this.getAppDocPath(uid, appId)).set(
      { _operational: { validationMeta } },
      { merge: true }
    );
  }
  /** Get validation results */
  async get(uid, appId) {
    try {
      const db2 = getFirestore();
      const doc = await db2.doc(this.getDocPath(uid, appId)).get();
      if (!doc.exists) return null;
      return doc.data();
    } catch (error) {
      console.error("[ValidationStore] Error getting validation results:", error);
      return null;
    }
  }
  /** Clear validation results */
  async clear(uid, appId) {
    const db2 = getFirestore();
    const { FieldValue } = await import('firebase-admin/firestore');
    await db2.doc(this.getDocPath(uid, appId)).delete();
    await db2.doc(this.getAppDocPath(uid, appId)).update({
      "_operational.validationMeta": FieldValue.delete()
    });
  }
};

export { ChangeSetStore, SchemaProtectionService, SchemaStore, SnapshotStore, ValidationStore, fromFirestoreFormat, toFirestoreFormat };
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map