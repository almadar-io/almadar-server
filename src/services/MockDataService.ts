/**
 * MockDataService - In-memory data store with faker-based mock generation
 *
 * Provides a stateful mock data layer that supports all CRUD operations.
 * Uses @faker-js/faker for realistic data generation based on field types.
 *
 * @packageDocumentation
 */

import {
  personaFromIdentityRow,
  resolveDefaultViewer,
  resolvePersonaSpec,
  type EntityField,
  type EntityPersistence,
  type EntityRow,
  type FieldValue,
  type UserContext,
} from '@almadar/core';
import { sampleFieldValue, sampleRowCount } from '@almadar/core/mock';
import { faker } from '@faker-js/faker';
import { env } from '../lib/env.js';
import { logger } from '../lib/logger.js';

/**
 * `ALMADAR_PERSONA_OWNS` — the columns that hold a user id, as `Entity.field`
 * pairs (`RosterEntry.memberId,Appointment.patientId`). Declared, never inferred
 * from a field name: a guess would silently scope the wrong column. Mirrors
 * `MockPersistenceConfig.ownerFields` on the interpreter path and
 * `OWNER_FIELDS_ENV` in the compiler's seeder.
 */
function ownerColumnsFor(entityName: string): string[] {
  const spec = process.env['ALMADAR_PERSONA_OWNS'];
  if (!spec) return [];
  const target = entityName.toLowerCase();
  return spec
    .split(',')
    .map((pair) => pair.trim().split('.'))
    .filter(([entity, field]) => Boolean(field) && entity?.toLowerCase() === target)
    .map(([, field]) => field)
    .filter((field): field is string => Boolean(field));
}

/** Reference `now` for seeded rows, matching the interpreted path's anchor. */
const SEED_REFERENCE_TIMESTAMP = '2024-01-01T00:00:00.000Z';

// ============================================================================
// Types
// ============================================================================

/**
 * The canonical entity field. This used to be a local shape whose narrow
 * `default?: string | number | boolean` forced the compiled path to drop every
 * array and object default — so authored `features = ["Item","Item 2"]` content
 * could never reach a generated app. Aliasing the canonical type is what lets
 * one policy serve both paths.
 */
export type FieldSchema = EntityField & { name: string };

export interface EntitySchema {
  fields: FieldSchema[];
  seedCount?: number;
  /**
   * The declared entity name. Stores are keyed by COLLECTION here, so a
   * relation naming its target entity (`assignee : Person`) cannot find the
   * store (`people`) without this mapping.
   */
  name?: string;
  /** `[identity]` — this collection's rows are the app's persona roster. */
  identity?: boolean;
}

interface BaseEntity {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// MockDataService
// ============================================================================

/**
 * In-memory mock data store with CRUD operations and faker-based seeding.
 */
export class MockDataService {
  private stores: Map<string, Map<string, unknown>> = new Map();
  private schemas: Map<string, EntitySchema> = new Map();
  private idCounters: Map<string, number> = new Map();

  constructor() {
    // Set seed for deterministic generation if provided
    if (env.MOCK_SEED !== undefined) {
      faker.seed(env.MOCK_SEED);
      logger.info(`[Mock] Using seed: ${env.MOCK_SEED}`);
    }
  }

  // ============================================================================
  // Store Management
  // ============================================================================

  /**
   * Initialize store for an entity.
   */
  private getStore(entityName: string): Map<string, unknown> {
    const normalized = entityName.toLowerCase();
    if (!this.stores.has(normalized)) {
      this.stores.set(normalized, new Map());
      this.idCounters.set(normalized, 0);
    }
    return this.stores.get(normalized)!;
  }

  /**
   * Generate next ID for an entity.
   */
  private nextId(entityName: string): string {
    const normalized = entityName.toLowerCase();
    const counter = (this.idCounters.get(normalized) ?? 0) + 1;
    this.idCounters.set(normalized, counter);
    return `mock-${normalized}-${counter}`;
  }

  // ============================================================================
  // Schema & Seeding
  // ============================================================================

  /**
   * Register an entity schema, keyed by collection (the key every store,
   * `seed` call and route uses on this path).
   */
  registerSchema(entityName: string, schema: EntitySchema): void {
    this.schemas.set(entityName.toLowerCase(), schema);
  }

  /**
   * The store key for a declared entity NAME.
   *
   * Stores are keyed by collection here, so `assignee : Person` against
   * `entity Person [persistent: people]` must resolve `Person` → `people`. The
   * old direct `Person`→`person` lookup always missed, so every relation column
   * seeded as `null` and every ownership-scoped view was empty regardless of
   * viewer. Falls back to the lowercased name for entities whose collection is
   * their name.
   */
  private collectionFor(entityName: string): string {
    const target = entityName.toLowerCase();
    for (const [collection, schema] of this.schemas) {
      if (schema.name?.toLowerCase() === target) return collection;
    }
    return target;
  }

  /**
   * The collection holding the app's `[identity]` rows, or `undefined` when the
   * app declares no identity entity. Declared by codegen off the OIR flag —
   * never inferred from a collection name.
   */
  getIdentityCollection(): string | undefined {
    for (const [collection, schema] of this.schemas) {
      if (schema.identity === true) return collection;
    }
    return undefined;
  }

  /**
   * The app's persona roster: the LIVE seeded rows of its `[identity]` entity.
   *
   * Live rows rather than a re-derivation, because the three seeders mint three
   * different id schemes (`Person-N` in the Rust roster, `mock-people-N` here,
   * `Person Id N` on the interpreter path). A persona whose id is not literally
   * one of these rows owns nothing, and every ownership-scoped list renders
   * empty — indistinguishable from a working filter over no data.
   *
   * Twin of `OrbitalServerRuntime.getIdentityRoster()` on the interpreter path.
   */
  getIdentityRoster(): UserContext[] {
    const collection = this.getIdentityCollection();
    if (!collection) return [];
    return this.list<Record<string, FieldValue | undefined>>(collection)
      .map((row) => personaFromIdentityRow(row))
      .filter((persona): persona is UserContext => persona !== undefined);
  }

  /**
   * The seeded viewer named by `ALMADAR_PERSONA`, if any.
   *
   * Resolves a bare id/role against the live roster above, so the viewer is
   * literally one of the seeded rows. Before Increment 4 this passed an empty
   * roster, so every bare spec threw and rows were left unowned — a generated
   * app could not be booted as a named persona at all.
   */
  private seedViewerId(): string | undefined {
    const roster = this.getIdentityRoster();
    const spec = process.env['ALMADAR_PERSONA'];
    // No spec is not "nobody": an app declaring an [identity] roster has no
    // anonymous viewer, and stamping nothing leaves every owner column empty, so
    // every ownership-scoped @read matches zero rows and the app renders empty
    // tables that look identical to a broken filter. Fall back to the FIRST
    // declared persona — deterministic roster order, never a ranking of roles —
    // exactly as the compiled path already does in
    // `orbital-client/src/render_probe.rs` (`seed_sample_as` with the same id).
    if (!spec) return resolveDefaultViewer(roster).id;
    try {
      return resolvePersonaSpec(spec, roster).id;
    } catch (error) {
      logger.warn(`[Mock] ALMADAR_PERSONA unresolved, rows left unowned: ${String(error)}`);
      return undefined;
    }
  }

  /**
   * Seed an entity with mock data.
   */
  seed(
    entityName: string,
    fields: FieldSchema[],
    requested: number = 10,
    persistence?: EntityPersistence,
  ): void {
    const store = this.getStore(entityName);
    const normalized = entityName.toLowerCase();
    const count = sampleRowCount({ name: entityName, persistence, fields }, requested);

    logger.info(`[Mock] Seeding ${count} ${entityName}...`);

    // `ALMADAR_PERSONA_OWNS` names `Entity.field` pairs (mirroring the
    // interpreter path's entity-keyed `ownerFields`), but everything here is
    // keyed by collection — so matching the raw key made `Ticket.assignee` miss
    // `tickets`, and no generated app ever stamped an owner.
    const ownerCols = ownerColumnsFor(this.schemas.get(normalized)?.name ?? entityName);
    const viewerId = this.seedViewerId();

    for (let i = 0; i < count; i++) {
      const item = this.generateMockItem(normalized, fields, i + 1, persistence);
      // Give the viewer every other row of each DECLARED owner column, so an
      // ownership-scoped view ("only my bookings") has real data while a second
      // persona still sees a different, non-empty set. Against rows that never
      // mention the viewer, a working filter and a broken one both render empty.
      if (viewerId && ownerCols.length > 0 && i % 2 === 0) {
        for (const col of ownerCols) item[col] = viewerId;
      }
      store.set(item.id, item);
    }
  }

  /**
   * Generate a single mock item based on field schemas.
   */
  private generateMockItem(
    entityName: string,
    fields: FieldSchema[],
    index: number,
    persistence?: EntityPersistence,
  ): BaseEntity & EntityRow {
    const id = this.nextId(entityName);
    // Anchored, not wallclock: a moving `updatedAt` made every row read as
    // "changed" between frames and disagreed with the interpreted path's rows.
    const item: EntityRow = {
      id,
      createdAt: faker.date.past({ years: 1 }),
      updatedAt: new Date(SEED_REFERENCE_TIMESTAMP),
    };

    for (const field of fields) {
      if (field.name === 'id' || field.name === 'createdAt' || field.name === 'updatedAt') {
        continue;
      }
      const value = this.generateFieldValue(entityName, field, index, persistence);
      if (value !== undefined) {
        item[field.name] = value;
      }
    }

    return item as BaseEntity & EntityRow;
  }

  /**
   * Generate a mock value for a field.
   *
   * The policy lives in `@almadar/core/mock`; only the store-aware relation
   * lookup is local, because resolving a real sibling id needs this instance's
   * stores. The old 20% `Math.random()` field-drop is gone: it was unseeded, so
   * it fired non-deterministically on essentially every field (`required` is
   * emitted only for `name : string!`), which made this path disagree with every
   * other seeder on every row.
   */
  private generateFieldValue(
    entityName: string,
    field: FieldSchema,
    index: number,
    persistence?: EntityPersistence,
  ): FieldValue | undefined {
    if (field.type === 'relation') {
      const related = field.relation?.entity;
      if (related) {
        const relatedStore = this.stores.get(this.collectionFor(related));
        if (relatedStore && relatedStore.size > 0) {
          return faker.helpers.arrayElement(Array.from(relatedStore.keys()));
        }
      }
      return null;
    }
    return sampleFieldValue(field, { entityName, index, strategy: 'seeded', persistence });
  }

  // ============================================================================
  // CRUD Operations
  // ============================================================================

  /**
   * List all items of an entity.
   */
  list<T>(entityName: string): T[] {
    const store = this.getStore(entityName);
    return Array.from(store.values()) as T[];
  }

  /**
   * Get a single item by ID.
   */
  getById<T>(entityName: string, id: string): T | null {
    const store = this.getStore(entityName);
    const item = store.get(id);
    return (item as T) ?? null;
  }

  /**
   * Create a new item.
   */
  create<T extends BaseEntity>(entityName: string, data: Partial<T>): T {
    const store = this.getStore(entityName);
    const id = this.nextId(entityName);
    const now = new Date();

    const item = {
      ...data,
      id,
      createdAt: now,
      updatedAt: now,
    } as T;

    store.set(id, item);
    return item;
  }

  /**
   * Update an existing item.
   */
  update<T extends BaseEntity>(entityName: string, id: string, data: Partial<T>): T | null {
    const store = this.getStore(entityName);
    const existing = store.get(id);

    if (!existing) {
      return null;
    }

    const updated = {
      ...(existing as T),
      ...data,
      id, // Preserve original ID
      updatedAt: new Date(),
    } as T;

    store.set(id, updated);
    return updated;
  }

  /**
   * Delete an item.
   */
  delete(entityName: string, id: string): boolean {
    const store = this.getStore(entityName);
    if (!store.has(id)) {
      return false;
    }
    store.delete(id);
    return true;
  }

  // ============================================================================
  // Utilities
  // ============================================================================

  /**
   * Clear all data for an entity.
   */
  clear(entityName: string): void {
    const normalized = entityName.toLowerCase();
    this.stores.delete(normalized);
    this.idCounters.delete(normalized);
  }

  /**
   * Clear all data.
   */
  clearAll(): void {
    this.stores.clear();
    this.idCounters.clear();
  }

  /**
   * Get count of items for an entity.
   */
  count(entityName: string): number {
    const store = this.getStore(entityName);
    return store.size;
  }
}

// Lazy singleton instance
let _mockDataService: MockDataService | null = null;

export function getMockDataService(): MockDataService {
  if (!_mockDataService) {
    _mockDataService = new MockDataService();
  }
  return _mockDataService;
}

export function resetMockDataService(): void {
  _mockDataService?.clearAll();
  _mockDataService = null;
}
