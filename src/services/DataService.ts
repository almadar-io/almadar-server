/**
 * DataService - Unified data access abstraction
 *
 * Provides a common interface for data operations that can be backed by
 * either MockDataService (for development) or Firebase (for production).
 *
 * @packageDocumentation
 */

import type { StoreContract, StoreFilter } from '@almadar/core';
import { db } from '../lib/db.js';
import { env } from '../lib/env.js';
import { logger } from '../lib/logger.js';
import { createLogger } from '../almadarLogger.js';
import { getMockDataService, type FieldSchema } from './MockDataService.js';

const dataLog = createLogger('almadar:server:data');
import {
  parseQueryFilters,
  applyFiltersToQuery,
  type ParsedFilter,
} from '../utils/queryFilters.js';

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

/**
 * Apply filter condition for in-memory filtering.
 * Used by MockDataServiceAdapter for all operators and
 * FirebaseDataService for operators not supported by Firestore.
 */
function applyFilterCondition(value: unknown, operator: string, filterValue: unknown): boolean {
  if (value === null || value === undefined) {
    return operator === '!=' ? filterValue !== null : false;
  }

  switch (operator) {
    case '==':
      return value === filterValue;
    case '!=':
      return value !== filterValue;
    case '>':
      return (value as number) > (filterValue as number);
    case '>=':
      return (value as number) >= (filterValue as number);
    case '<':
      return (value as number) < (filterValue as number);
    case '<=':
      return (value as number) <= (filterValue as number);
    case 'array-contains':
      return Array.isArray(value) && value.includes(filterValue);
    case 'array-contains-any':
      return (
        Array.isArray(value) &&
        Array.isArray(filterValue) &&
        filterValue.some((v: unknown) => value.includes(v))
      );
    case 'in':
      return Array.isArray(filterValue) && filterValue.includes(value);
    case 'not-in':
      return Array.isArray(filterValue) && !filterValue.includes(value);
    default:
      return true;
  }
}

// ============================================================================
// MockDataServiceAdapter
// ============================================================================

/**
 * Adapter that wraps MockDataService with async interface.
 */
class MockDataServiceAdapter implements DataService {
  async list<T>(collection: string): Promise<T[]> {
    const result = getMockDataService().list<T>(collection);
    dataLog.debug('list', { entity: collection, count: result.length });
    return result;
  }

  async listPaginated<T>(
    collection: string,
    options: PaginationOptions = {}
  ): Promise<PaginatedResult<T>> {
    const {
      page = 1,
      pageSize = 20,
      search,
      searchFields,
      sortBy,
      sortOrder = 'asc',
      filters,
    } = options;

    let items = getMockDataService().list<T>(collection);

    // Apply field filters (server-side filtering)
    if (filters && filters.length > 0) {
      items = items.filter((item) => {
        const record = item as Record<string, unknown>;
        return filters.every((filter) => {
          const value = record[filter.field];
          return applyFilterCondition(value, filter.operator, filter.value);
        });
      });
    }

    // Apply search filter
    if (search && search.trim()) {
      const searchLower = search.toLowerCase();
      items = items.filter((item) => {
        const record = item as Record<string, unknown>;
        const fieldsToSearch = searchFields || Object.keys(record);
        return fieldsToSearch.some((field) => {
          const value = record[field];
          if (value === null || value === undefined) return false;
          return String(value).toLowerCase().includes(searchLower);
        });
      });
    }

    // Apply sorting
    if (sortBy) {
      items = [...items].sort((a, b) => {
        const aVal = (a as Record<string, unknown>)[sortBy];
        const bVal = (b as Record<string, unknown>)[sortBy];
        if (aVal === bVal) return 0;
        if (aVal === null || aVal === undefined) return 1;
        if (bVal === null || bVal === undefined) return -1;
        const comparison = aVal < bVal ? -1 : 1;
        return sortOrder === 'asc' ? comparison : -comparison;
      });
    }

    const total = items.length;
    const totalPages = Math.ceil(total / pageSize);
    const startIndex = (page - 1) * pageSize;
    const data = items.slice(startIndex, startIndex + pageSize);

    return { data, total, page, pageSize, totalPages };
  }

  async getById<T>(collection: string, id: string): Promise<T | null> {
    const result = getMockDataService().getById<T>(collection, id);
    dataLog.debug('getById', { entity: collection, id, found: result !== null });
    return result;
  }

  async create<T extends BaseEntity>(collection: string, data: Partial<T>): Promise<T> {
    const result = getMockDataService().create<T>(collection, data);
    dataLog.info('create', { entity: collection, id: result.id });
    return result;
  }

  async update<T extends BaseEntity>(
    collection: string,
    id: string,
    data: Partial<T>
  ): Promise<T | null> {
    const result = getMockDataService().update<T>(collection, id, data);
    dataLog.info('update', { entity: collection, id, found: result !== null });
    return result;
  }

  async delete(collection: string, id: string): Promise<boolean> {
    const result = getMockDataService().delete(collection, id);
    dataLog.info('delete', { entity: collection, id, success: result });
    return result;
  }

  async query<T>(collection: string, filters: StoreFilter<T>[]): Promise<T[]> {
    let items = getMockDataService().list<T>(collection);
    for (const filter of filters) {
      items = items.filter((item) => {
        const value = (item as Record<string, unknown>)[filter.field];
        return applyFilterCondition(value, filter.op, filter.value);
      });
    }
    return items;
  }

  getStore<T extends BaseEntity>(collection: string): StoreContract<T> {
    const adapter = this;
    return {
      async getById(id: string): Promise<T | null> {
        return adapter.getById<T>(collection, id);
      },
      async create(data: Omit<T, 'id'>): Promise<T> {
        return adapter.create<T>(collection, data as Partial<T>);
      },
      async update(id: string, data: Partial<T>): Promise<T> {
        const result = await adapter.update<T>(collection, id, data);
        if (!result) throw new Error(`Entity ${id} not found in ${collection}`);
        return result;
      },
      async delete(id: string): Promise<void> {
        adapter.delete(collection, id);
      },
      async query(filters: StoreFilter<T>[]): Promise<T[]> {
        return adapter.query<T>(collection, filters);
      },
    };
  }
}

// ============================================================================
// FirebaseDataService
// ============================================================================

/**
 * Firebase/Firestore implementation of DataService.
 */
class FirebaseDataService implements DataService {
  async list<T>(collection: string): Promise<T[]> {
    const snapshot = await db.collection(collection).get();
    const items = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as T[];
    dataLog.debug('list', { entity: collection, count: items.length });
    return items;
  }

  async listPaginated<T>(
    collection: string,
    options: PaginationOptions = {}
  ): Promise<PaginatedResult<T>> {
    const {
      page = 1,
      pageSize = 20,
      search,
      searchFields,
      sortBy,
      sortOrder = 'asc',
      filters,
    } = options;

    // For Firebase, we apply filters using Firestore's .where() for supported operators
    // Note: For large datasets, consider using Algolia or Elasticsearch for search
    let query: FirebaseFirestore.Query = db.collection(collection);

    // Apply field filters using Firestore's where() clauses
    if (filters && filters.length > 0) {
      query = applyFiltersToQuery(query, filters);
    }

    // Apply sorting if no search (Firestore can sort natively)
    if (sortBy && !search) {
      query = query.orderBy(sortBy, sortOrder);
    }

    const snapshot = await query.get();
    let items = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as T[];

    // Apply search filter (in-memory for Firebase)
    if (search && search.trim()) {
      const searchLower = search.toLowerCase();
      items = items.filter((item) => {
        const record = item as Record<string, unknown>;
        const fieldsToSearch = searchFields || Object.keys(record);
        return fieldsToSearch.some((field) => {
          const value = record[field];
          if (value === null || value === undefined) return false;
          return String(value).toLowerCase().includes(searchLower);
        });
      });
    }

    // Apply sorting (in-memory if search was applied)
    if (sortBy && search) {
      items = [...items].sort((a, b) => {
        const aVal = (a as Record<string, unknown>)[sortBy];
        const bVal = (b as Record<string, unknown>)[sortBy];
        if (aVal === bVal) return 0;
        if (aVal === null || aVal === undefined) return 1;
        if (bVal === null || bVal === undefined) return -1;
        const comparison = aVal < bVal ? -1 : 1;
        return sortOrder === 'asc' ? comparison : -comparison;
      });
    }

    const total = items.length;
    const totalPages = Math.ceil(total / pageSize);
    const startIndex = (page - 1) * pageSize;
    const data = items.slice(startIndex, startIndex + pageSize);

    return { data, total, page, pageSize, totalPages };
  }

  async getById<T>(collection: string, id: string): Promise<T | null> {
    const doc = await db.collection(collection).doc(id).get();
    dataLog.debug('getById', { entity: collection, id, found: doc.exists });
    if (!doc.exists) {
      return null;
    }
    return { id: doc.id, ...doc.data() } as T;
  }

  async create<T extends BaseEntity>(collection: string, data: Partial<T>): Promise<T> {
    const now = new Date();
    const docRef = await db.collection(collection).add({
      ...data,
      createdAt: now,
      updatedAt: now,
    });

    dataLog.info('create', { entity: collection, id: docRef.id });
    return {
      ...data,
      id: docRef.id,
      createdAt: now,
      updatedAt: now,
    } as T;
  }

  async update<T extends BaseEntity>(
    collection: string,
    id: string,
    data: Partial<T>
  ): Promise<T | null> {
    const docRef = db.collection(collection).doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return null;
    }

    const now = new Date();
    await docRef.update({
      ...data,
      updatedAt: now,
    });

    dataLog.info('update', { entity: collection, id });
    return {
      ...doc.data(),
      ...data,
      id,
      updatedAt: now,
    } as T;
  }

  async delete(collection: string, id: string): Promise<boolean> {
    const docRef = db.collection(collection).doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      dataLog.debug('delete', { entity: collection, id, found: false });
      return false;
    }

    await docRef.delete();
    dataLog.info('delete', { entity: collection, id, success: true });
    return true;
  }

  async query<T>(collection: string, filters: StoreFilter<T>[]): Promise<T[]> {
    let query: FirebaseFirestore.Query = db.collection(collection);

    // Apply filters that Firestore supports natively
    const memoryFilters: StoreFilter<T>[] = [];
    for (const filter of filters) {
      if (['==', '!=', '<', '<=', '>', '>=', 'in', 'not-in'].includes(filter.op)) {
        query = query.where(filter.field, filter.op as FirebaseFirestore.WhereFilterOp, filter.value);
      } else {
        memoryFilters.push(filter);
      }
    }

    const snapshot = await query.get();
    let items = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as T[];

    // Apply remaining filters in memory (e.g., 'contains')
    for (const filter of memoryFilters) {
      items = items.filter((item) => {
        const value = (item as Record<string, unknown>)[filter.field];
        return applyFilterCondition(value, filter.op, filter.value);
      });
    }

    return items;
  }

  getStore<T extends BaseEntity>(collection: string): StoreContract<T> {
    const svc = this;
    return {
      async getById(id: string): Promise<T | null> {
        return svc.getById<T>(collection, id);
      },
      async create(data: Omit<T, 'id'>): Promise<T> {
        return svc.create<T>(collection, data as Partial<T>);
      },
      async update(id: string, data: Partial<T>): Promise<T> {
        const result = await svc.update<T>(collection, id, data);
        if (!result) throw new Error(`Entity ${id} not found in ${collection}`);
        return result;
      },
      async delete(id: string): Promise<void> {
        await svc.delete(collection, id);
      },
      async query(filters: StoreFilter<T>[]): Promise<T[]> {
        return svc.query<T>(collection, filters);
      },
    };
  }
}

// ============================================================================
// Factory & Export
// ============================================================================

/**
 * Create the appropriate data service based on environment configuration.
 */
function createDataService(): DataService {
  if (env.USE_MOCK_DATA) {
    logger.info('[DataService] Using MockDataService');
    return new MockDataServiceAdapter();
  }
  logger.info('[DataService] Using FirebaseDataService');
  return new FirebaseDataService();
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
 * Only works when USE_MOCK_DATA is enabled.
 */
export function seedMockData(entities: EntitySeedConfig[]): void {
  if (!env.USE_MOCK_DATA) {
    logger.info('[DataService] Mock mode disabled, skipping seed');
    return;
  }

  logger.info('[DataService] Seeding mock data...');

  for (const entity of entities) {
    getMockDataService().seed(entity.name, entity.fields, entity.seedCount);
  }

  logger.info('[DataService] Mock data seeding complete');
}
