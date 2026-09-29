/**
 * DataService - Unified data access abstraction
 *
 * One facade (`dataServiceOver`) over the backend's `PersistenceAdapter`: mock, Firestore,
 * Postgres or CouchDB, each observed as `db` call records.
 *
 * @packageDocumentation
 */

import type { StoreContract, StoreFilter } from '@almadar/core';
import { Pool } from 'pg';
import nano from 'nano';
import { env } from '../lib/env.js';
import { logger } from '../lib/logger.js';
import { getMockDataService, MockDataPersistence, type FieldSchema } from './MockDataService.js';
import { PostgresDataService } from './postgres/postgres-data-service.js';
import { CouchDBDataService } from './couchdb/couchdb-data-service.js';
import { FirestorePersistence } from './firestore/firestore-persistence.js';
import { observedPersistence } from './observed-persistence.js';
import { dataServiceOver } from './data/data-service-over.js';
import type { ParsedFilter } from '../utils/queryFilters.js';

// ============================================================================
// Types
// ============================================================================

interface BaseEntity {
  id: string;
  createdAt: Date;
  updatedAt: Date;
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
 * Create the appropriate data service based on environment configuration.
 */
function createDataService(): DataService {
  if (env.USE_MOCK_DATA) {
    // warn, not info: rows are in-memory and lost on restart. env.ts refuses
    // this combination outright under NODE_ENV=production, so reaching here
    // means a deliberate dev opt-in — but it must still be visible in the log.
    logger.warn('[DataService] USE_MOCK_DATA=true — serving in-memory mock rows, not the real data source');
    return dataServiceOver(observedPersistence(new MockDataPersistence(getMockDataService), { service: 'mock' }));
  }
  if (env.DATA_BACKEND === 'postgres') {
    if (!env.DATABASE_URL) {
      throw new Error(
        '@almadar/server: DATA_BACKEND=postgres requires DATABASE_URL to be set',
      );
    }
    logger.info('[DataService] Using PostgresDataService');
    logger.info(
      'Postgres adapter: hosts call ensureSchema + optionally applySchemaEvolution at boot for entity-field changes (additive by default; destructive requires policy.destructive + PG_MIGRATE_DESTRUCTIVE=apply)',
    );
    const pool = new Pool({
      connectionString: env.DATABASE_URL,
      ...(env.PGPOOL_MAX !== undefined ? { max: env.PGPOOL_MAX } : {}),
    });
    return new PostgresDataService({ pool });
  }
  if (env.DATA_BACKEND === 'couchdb') {
    if (!env.COUCHDB_URL) {
      throw new Error(
        '@almadar/server: DATA_BACKEND=couchdb requires COUCHDB_URL to be set',
      );
    }
    logger.info('[DataService] Using CouchDBDataService');
    const client = nano(env.COUCHDB_URL);
    return new CouchDBDataService({ client });
  }
  logger.info('[DataService] Using Firestore');
  return dataServiceOver(observedPersistence(new FirestorePersistence({ root: '' }), { service: 'firestore' }));
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
 * Runs when USE_MOCK_DATA is enabled or when DATA_BACKEND=postgres/couchdb
 * (dev fixture parity; the firebase path stays unseeded).
 */
export function seedMockData(entities: EntitySeedConfig[]): void {
  if (!env.USE_MOCK_DATA && env.DATA_BACKEND !== 'postgres' && env.DATA_BACKEND !== 'couchdb') {
    logger.info('[DataService] Mock mode disabled, skipping seed');
    return;
  }

  logger.info('[DataService] Seeding mock data...');

  for (const entity of entities) {
    getMockDataService().seed(entity.name, entity.fields, entity.seedCount);
  }

  logger.info('[DataService] Mock data seeding complete');
}
