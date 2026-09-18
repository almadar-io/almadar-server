/**
 * Services barrel export
 *
 * @packageDocumentation
 */

export { MockDataService, getMockDataService, resetMockDataService, type FieldSchema, type EntitySchema } from './MockDataService.js';
export { getDataService, resetDataService, seedMockData, type DataService, type EntitySeedConfig } from './DataService.js';
export { getSubstrateService, setSubstrateService, resetSubstrateService, type SubstrateService } from './substrate.js';
export {
  PostgresDataService,
  type PostgresDataServiceOptions,
  PostgresPersistence,
  type PostgresPersistenceOptions,
  ensureSchema,
  generateSchemaDdl,
  diffSchema,
  applySchemaEvolution,
  type SchemaDiff,
  type EvolutionPolicy,
  type EvolutionReport,
} from './postgres/index.js';
export {
  CouchDBDataService,
  type CouchDBDataServiceOptions,
  CouchDBPersistence,
  type CouchDBPersistenceOptions,
} from './couchdb/index.js';
