/**
 * MockDataService - the compiled apps' mock data API (collection-keyed, synchronous; generated
 * `seedMockData.ts` calls it without awaiting) over `@almadar/db`'s `MockPersistenceAdapter`, the one
 * mock store both execution paths seed from: same PRNG, same ids, same relation and owner linking.
 * What stays here is the compiled path's own inputs: collection → entity naming, owner columns
 * from the schema or `ALMADAR_PERSONA_OWNS`, and the viewer from `ALMADAR_PERSONA`.
 *
 * @packageDocumentation
 */

import type { BaseEntity } from './DataService.js';
import {
  personaFromIdentityRow,
  type PersistenceAdapter,
  resolveDefaultViewer,
  resolvePersonaSpec,
  type EntityField,
  type EntityPersistence,
  type EntityRow,
  type OrbitalSchema,
  type SExpr,
  type UserContext,
} from '@almadar/core';
import { MockPersistenceAdapter } from '@almadar/db/mock';
import { installPolicyOwnerGates } from '@almadar/runtime/mockPersistence';
import { ownerFieldsFromSchema } from '@almadar/core/mock';
import { env } from '../lib/env.js';
import { logger } from '../lib/logger.js';
import { isoTimestamps } from '@almadar/db';

/**
 * The columns that hold a user id. Declared, never inferred from a field name:
 * a guess would silently scope the wrong column.
 *
 * Primary source is the schema's own `ownerFields`, which codegen derives from
 * the declared `@read`/`@update`/`@delete` policy (`["==", ["object/get",
 * "@entity","authorId"], "@user.id"]` names `authorId` outright). Relying on
 * `ALMADAR_PERSONA_OWNS` alone was the bug: nothing in codegen, in a generated
 * app, or in the verify harness ever set it, so this returned `[]` every time,
 * the owner column fell through to a random relation pick, and every
 * ownership-scoped list rendered "No items" while every request succeeded
 * (§57). The env var stays as a manual override for fixtures with no compiled
 * schema behind them, and mirrors `MockPersistenceConfig.ownerFields` on the
 * interpreter path.
 */
function ownerColumnsFor(entityName: string, schema?: EntitySchema): string[] {
  const declared = schema?.ownerFields ?? [];
  if (declared.length > 0) return declared;
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
  /**
   * The columns a declared `@read`/`@update`/`@delete` compares to `@user.id`,
   * emitted by older codegen. Current codegen emits the directives themselves
   * (below) and owner columns are derived from them; `ALMADAR_PERSONA_OWNS`
   * remains as a manual override for fixtures with no compiled schema behind them.
   */
  ownerFields?: string[];
  /** The entity's declared access directives, as the resolved schema states them. */
  readPolicy?: SExpr;
  createPolicy?: SExpr;
  updatePolicy?: SExpr;
  deletePolicy?: SExpr;
}


// ============================================================================
// MockDataService
// ============================================================================

type MockRow = BaseEntity & EntityRow;

/** Rows are stored as `EntityRow`; callers name their shape. The one boundary between the two. */
function asEntity<T>(row: EntityRow): T {
  return row as T;
}

function asRow<T extends object>(value: T): EntityRow {
  const row: EntityRow = {};
  for (const [key, field] of Object.entries(value)) {
    const v: EntityRow[string] = field;
    if (v !== undefined) row[key] = v;
  }
  return row;
}

export class MockDataService {
  private readonly store: MockPersistenceAdapter;
  /** Registered entities by lowercased name, in registration order. */
  private entities: Map<string, { collection: string; schema: EntitySchema & { name: string } }> = new Map();
  /** Lowercased collection -> the first entity registered on it. */
  private collectionEntity: Map<string, string> = new Map();
  /** The viewer seeded rows are stamped for, resolved against the live roster. */
  private viewer: UserContext | undefined;

  constructor() {
    this.store = new MockPersistenceAdapter(env.MOCK_SEED !== undefined ? { seed: env.MOCK_SEED } : {});
    if (env.MOCK_SEED !== undefined) logger.info(`[Mock] Using seed: ${env.MOCK_SEED}`);
  }

  /** The entity a key names: a registered entity name, or a collection's first entity. */
  private entityOf(key: string): string {
    const lower = key.toLowerCase();
    return this.entities.get(lower)?.schema.name ?? this.collectionEntity.get(lower) ?? key;
  }

  /** The registered entities as an `OrbitalSchema`, so owner columns and access policies come
   *  from the same functions the runtime uses (`ownerFieldsFromSchema`, `entityAccessPoliciesByStoreKey`). */
  private registeredSchema(): OrbitalSchema {
    return {
      name: 'mock-seed',
      orbitals: [...this.entities.values()].map(({ collection, schema }) => ({
        name: schema.name,
        entity: {
          name: schema.name,
          collection,
          ...(schema.identity ? { identity: true } : {}),
          fields: schema.fields,
          ...(schema.readPolicy !== undefined ? { read_policy: schema.readPolicy } : {}),
          ...(schema.createPolicy !== undefined ? { create_policy: schema.createPolicy } : {}),
          ...(schema.updatePolicy !== undefined ? { update_policy: schema.updatePolicy } : {}),
          ...(schema.deletePolicy !== undefined ? { delete_policy: schema.deletePolicy } : {}),
        },
        traits: [],
        pages: [],
      })),
    };
  }

  // ============================================================================
  // Schema & Seeding
  // ============================================================================

  /**
   * Register an entity schema under its collection (the key generated calls use).
   * Entities sharing a collection each register; the first names the store.
   */
  registerSchema(collection: string, schema: EntitySchema): void {
    const name = schema.name ?? collection;
    this.entities.set(name.toLowerCase(), { collection, schema: { ...schema, name } });
    if (!this.collectionEntity.has(collection.toLowerCase())) this.collectionEntity.set(collection.toLowerCase(), name);
  }

  /**
   * The collection holding the app's `[identity]` rows, or `undefined` when the
   * app declares no identity entity. Declared by codegen off the OIR flag —
   * never inferred from a collection name.
   */
  getIdentityCollection(): string | undefined {
    for (const { collection, schema } of this.entities.values()) {
      if (schema.identity === true) return collection;
    }
    return undefined;
  }

  /**
   * The app's persona roster: the LIVE seeded rows of its `[identity]` entity,
   * so every persona id is literally a stored row id.
   *
   * Twin of `OrbitalServerRuntime.getIdentityRoster()` on the interpreter path.
   */
  getIdentityRoster(): UserContext[] {
    const collection = this.getIdentityCollection();
    if (!collection) return [];
    return this.list<EntityRow>(collection)
      .map((row) => personaFromIdentityRow(row))
      .filter((persona): persona is UserContext => persona !== undefined);
  }

  /**
   * The seeded viewer named by `ALMADAR_PERSONA`, resolved against the live
   * roster; without a spec, the first declared persona (deterministic roster
   * order), exactly as the compiled path's `render_probe.rs` does.
   */
  private seedViewer(): UserContext | undefined {
    const roster = this.getIdentityRoster();
    const spec = process.env['ALMADAR_PERSONA'];
    if (!spec) return resolveDefaultViewer(roster);
    try {
      return resolvePersonaSpec(spec, roster);
    } catch (error) {
      logger.warn(`[Mock] ALMADAR_PERSONA unresolved, rows left unowned: ${String(error)}`);
      return undefined;
    }
  }

  /** The owner gates, installed exactly as the runtime installs them (`installPolicyOwnerGates`). */
  private installOwnerGate(schema: OrbitalSchema): void {
    installPolicyOwnerGates(this.store, schema, () => this.viewer);
  }


  /**
   * Seed an entity through the shared store. `key` is the entity name (a collection
   * still resolves to its first entity). The viewer owns every other row of each owner
   * column the gate lets it create; a store that already holds rows is backfilled.
   */
  seed(
    key: string,
    fields: FieldSchema[],
    requested: number = 6,
    persistence?: EntityPersistence,
  ): void {
    const entity = this.entityOf(key);
    const registered = this.entities.get(entity.toLowerCase());
    const collection = registered?.collection ?? key;
    const schema = this.registeredSchema();
    const legacyOwners = ownerColumnsFor(entity, registered?.schema).map((col) => `${entity}.${col}`);
    this.store.addOwnerFields([...ownerFieldsFromSchema(schema), ...legacyOwners]);
    this.installOwnerGate(schema);
    this.viewer = this.seedViewer();
    this.store.restampOwner(this.viewer?.id);
    this.store.registerEntity(
      { name: entity, collection, fields, ...(persistence ? { persistence } : {}), ...(registered?.schema.identity ? { identity: true } : {}) },
      requested,
    );
    logger.info(`[Mock] Seeded ${this.store.count(entity)} ${entity}`);
  }

  // ============================================================================
  // CRUD Operations
  // ============================================================================

  list<T>(entityName: string): T[] {
    return this.store.rowsOf(this.entityOf(entityName)).map((row) => asEntity<T>(row));
  }

  getById<T>(entityName: string, id: string): T | null {
    const row = this.store.rowOf(this.entityOf(entityName), id);
    return row === null ? null : asEntity<T>(row);
  }

  create<T extends BaseEntity = MockRow>(entityName: string, data: Partial<T>): T {
    return asEntity<T>(this.store.insertRow(this.entityOf(entityName), asRow(data)));
  }

  update<T extends BaseEntity = MockRow>(entityName: string, id: string, data: Partial<T>): T | null {
    const row = this.store.patchRow(this.entityOf(entityName), id, asRow(data));
    return row === null ? null : asEntity<T>(row);
  }

  delete(entityName: string, id: string): boolean {
    return this.store.removeRow(this.entityOf(entityName), id);
  }

  // ============================================================================
  // Utilities
  // ============================================================================

  clear(entityName: string): void {
    this.store.clear(this.entityOf(entityName));
  }

  clearAll(): void {
    this.store.clearAll();
  }

  count(entityName: string): number {
    return this.store.count(this.entityOf(entityName));
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

/** The mock data service as a `PersistenceAdapter`, so the mock DataService is the shared facade over it. */
export class MockDataPersistence implements PersistenceAdapter {
  /** A getter, so `resetMockDataService()` swaps the instance under a long-lived adapter. */
  constructor(private readonly service: () => MockDataService) {}

  private get mock(): MockDataService {
    return this.service();
  }

  async create(entityType: string, data: EntityRow): Promise<{ id: string }> {
    return { id: this.mock.create<MockRow>(entityType, data).id };
  }

  async update(entityType: string, id: string, data: EntityRow): Promise<void> {
    this.mock.update<MockRow>(entityType, id, data);
  }

  async delete(entityType: string, id: string): Promise<void> {
    this.mock.delete(entityType, id);
  }

  async getById(entityType: string, id: string): Promise<EntityRow | null> {
    const row = this.mock.getById<EntityRow>(entityType, id);
    return row === null ? null : isoTimestamps(row);
  }

  async list(entityType: string): Promise<EntityRow[]> {
    return this.mock.list<EntityRow>(entityType).map(isoTimestamps);
  }

  async countRows(entityType: string): Promise<number> {
    return this.mock.count(entityType);
  }
}
