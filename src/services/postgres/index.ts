/**
 * Postgres DataService barrel; the adapter, DDL and evolution live in `@almadar/db`.
 *
 * Host injection:
 * ```ts
 * const pool = new Pool({ connectionString: process.env.DATABASE_URL });
 * await ensureSchema(pool, entities);
 * // optional: evolve an existing database to the declared schema
 * await applySchemaEvolution(pool, entities, { destructive: false });
 * new OrbitalServerRuntime({ persistence: new PostgresPersistence({ pool }) });
 * ```
 * `applySchemaEvolution` is host-called at boot (the factory has no entity
 * registry); additive changes apply automatically, destructive changes are
 * refused unless the caller passes `destructive: true` AND the host sets
 * PG_MIGRATE_DESTRUCTIVE=apply (in production, a destructive diff without
 * that env opt-in aborts with an error).
 */
export { PostgresDataService, type PostgresDataServiceOptions } from './postgres-data-service.js';
export { applySchemaEvolution } from './schema-evolution.js';
