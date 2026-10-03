/**
 * Postgres `DataService`: the DataService facade over `PostgresPersistence`, observed as
 * `postgres` calls. Kept as a class for its public name and `close()`.
 */
import type { Pool } from 'pg';
import type { StoreContract, StoreFilter } from '@almadar/core';
import type { BaseEntity, DataService, PaginationOptions, PaginatedResult } from '../DataService.js';
import { dataServiceOver } from '../data/data-service-over.js';
import { observedPersistence } from '../observed-persistence.js';
import { PostgresPersistence } from './postgres-persistence.js';


export interface PostgresDataServiceOptions {
  pool: Pool;
}

export class PostgresDataService implements DataService {
  private readonly persistence: PostgresPersistence;
  private readonly inner: DataService;

  constructor(options: PostgresDataServiceOptions) {
    this.persistence = new PostgresPersistence({ pool: options.pool });
    this.inner = dataServiceOver(observedPersistence(this.persistence, { service: 'postgres' }));
  }

  list<T>(collection: string): Promise<T[]> { return this.inner.list<T>(collection); }
  listPaginated<T>(collection: string, options?: PaginationOptions): Promise<PaginatedResult<T>> { return this.inner.listPaginated<T>(collection, options); }
  getById<T>(collection: string, id: string): Promise<T | null> { return this.inner.getById<T>(collection, id); }
  create<T extends BaseEntity>(collection: string, data: Partial<T>): Promise<T> { return this.inner.create<T>(collection, data); }
  update<T extends BaseEntity>(collection: string, id: string, data: Partial<T>): Promise<T | null> { return this.inner.update<T>(collection, id, data); }
  delete(collection: string, id: string): Promise<boolean> { return this.inner.delete(collection, id); }
  query<T>(collection: string, filters: StoreFilter<T>[]): Promise<T[]> { return this.inner.query<T>(collection, filters); }
  getStore<T extends BaseEntity>(collection: string): StoreContract<T> { return this.inner.getStore<T>(collection); }

  close(): Promise<void> {
    return this.persistence.close();
  }
}
