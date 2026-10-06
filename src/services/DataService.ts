/**
 * DataService - Unified data access abstraction
 *
 * One facade (`dataServiceOver`) over the backend's `PersistenceAdapter`: mock, Firestore,
 * Postgres or CouchDB, each observed as `db` call records.
 *
 * @packageDocumentation
 */

import type { StoreContract, StoreFilter } from '@almadar/core';
import { persistenceSpec } from '../lib/env.js';
import { logger } from '../lib/logger.js';
import { getMockDataService, MockDataPersistence, type FieldSchema } from './MockDataService.js';
import { observedPersistence } from '@almadar/db';
import { createPersistence, type PersistenceSpec } from '@almadar/db/backend';
import { dataServiceOver } from './data/data-service-over.js';
import type { ParsedFilter } from '../utils/queryFilters.js';

// ============================================================================
// Types
// ============================================================================

/** Every stored row: its id and ISO-8601 creation/update stamps. */
export interface BaseEntity {
  id: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Pagination options for list queries
 */
export interface PaginationOptions {
  /** Page number (1-indexed) */
  page?: number;
  /** Number of items per page */
  pageSize?: number;
  /** Search term to filter results */
  search?: string;
  /** Fields to search in (defaults to all string fields) */
  searchFields?: string[];
  /** Sort field */
  sortBy?: string;
  /** Sort direction */
  sortOrder?: 'asc' | 'desc';
  /** Filters parsed from query params */
  filters?: ParsedFilter[];
}

/**
 * Paginated response structure
 */
export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface DataService {
  list<T>(collection: string): Promise<T[]>;
  listPaginated<T>(collection: string, options?: PaginationOptions): Promise<PaginatedResult<T>>;
  getById<T>(collection: string, id: string): Promise<T | null>;
  create<T extends BaseEntity>(collection: string, data: Partial<T>): Promise<T>;
  update<T extends BaseEntity>(collection: string, id: string, data: Partial<T>): Promise<T | null>;
  delete(collection: string, id: string): Promise<boolean>;
  query<T>(collection: string, filters: StoreFilter<T>[]): Promise<T[]>;
  /** Get a typed StoreContract<T> bound to a specific collection. */
  getStore<T extends BaseEntity>(collection: string): StoreContract<T>;
}

// ============================================================================
// Factory & Export
// ============================================================================

/**
 * The data service for the declared persistence spec. The mock backend stays an explicit
 * special case: the compiled apps' generated `seedMockData` seeds the `MockDataService`
 * singleton synchronously, so the mock spec hands `createPersistence` that singleton's adapter
 * instead of a fresh store.
 */
function createDataService(spec: PersistenceSpec = persistenceSpec): DataService {
  switch (spec.backend) {
    case 'mock':
      // warn, not info: rows are in-memory and lost on restart. `persistenceSpecFromEnv` refuses
      // this under NODE_ENV=production, so reaching here means a deliberate dev opt-in.
      logger.warn('[DataService] mock backend — serving in-memory mock rows, not the real data source');
      return dataServiceOver(
        observedPersistence(createPersistence({ backend: 'mock', adapter: new MockDataPersistence(getMockDataService) }), { service: 'mock' }),
      );
    case 'postgres':
      logger.info('[DataService] Using PostgresPersistence');
      logger.info(
        'Postgres adapter: hosts call ensureSchema + optionally applySchemaEvolution at boot for entity-field changes (additive by default; destructive requires policy.destructive + PG_MIGRATE_DESTRUCTIVE=apply)',
      );
      break;
    case 'couchdb':
      logger.info('[DataService] Using CouchDBPersistence');
      break;
    case 'firestore':
      logger.info('[DataService] Using Firestore');
      break;
    case 'memory':
      logger.info('[DataService] Using in-memory persistence');
      break;
  }
  return dataServiceOver(observedPersistence(createPersistence(spec), { service: spec.backend }));
}

/**
 * Lazy singleton data service instance.
 */
let _dataService: DataService | null = null;

export function getDataService(): DataService {
  if (!_dataService) {
    _dataService = createDataService();
  }
  return _dataService;
}

export function resetDataService(): void {
  _dataService = null;
}

// ============================================================================
// Seeding Helper
// ============================================================================

export interface EntitySeedConfig {
  name: string;
  fields: FieldSchema[];
  seedCount: number;
}

/**
 * Seed mock data for multiple entities.
 * Runs when the mock backend is declared or when the backend is postgres/couchdb
 * (dev fixture parity; the firebase path stays unseeded).
 */
export function seedMockData(entities: EntitySeedConfig[]): void {
  if (persistenceSpec.backend !== 'mock' && persistenceSpec.backend !== 'postgres' && persistenceSpec.backend !== 'couchdb') {
    logger.info('[DataService] Mock mode disabled, skipping seed');
    return;
  }

  logger.info('[DataService] Seeding mock data...');

  for (const entity of entities) {
    getMockDataService().seed(entity.name, entity.fields, entity.seedCount);
  }

  logger.info('[DataService] Mock data seeding complete');
}
