/**
 * CouchDB `DataService`: the DataService facade over `CouchDBPersistence`, observed as `couchdb`
 * calls. Kept as a class for its public name.
 */
import type { StoreContract, StoreFilter } from '@almadar/core';
import type { DataService, PaginationOptions, PaginatedResult } from '../DataService.js';
import { dataServiceOver } from '../data/data-service-over.js';
import { observedPersistence } from '../observed-persistence.js';
import { CouchDBPersistence } from './couchdb-persistence.js';
import type { CouchDBClient } from './rows.js';

interface RowBase {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CouchDBDataServiceOptions {
  client: CouchDBClient;
}

export class CouchDBDataService implements DataService {
  private readonly inner: DataService;

  constructor(options: CouchDBDataServiceOptions) {
    this.inner = dataServiceOver(observedPersistence(new CouchDBPersistence({ client: options.client }), { service: 'couchdb' }));
  }

  list<T>(collection: string): Promise<T[]> { return this.inner.list<T>(collection); }
  listPaginated<T>(collection: string, options?: PaginationOptions): Promise<PaginatedResult<T>> { return this.inner.listPaginated<T>(collection, options); }
  getById<T>(collection: string, id: string): Promise<T | null> { return this.inner.getById<T>(collection, id); }
  create<T extends RowBase>(collection: string, data: Partial<T>): Promise<T> { return this.inner.create<T>(collection, data); }
  update<T extends RowBase>(collection: string, id: string, data: Partial<T>): Promise<T | null> { return this.inner.update<T>(collection, id, data); }
  delete(collection: string, id: string): Promise<boolean> { return this.inner.delete(collection, id); }
  query<T>(collection: string, filters: StoreFilter<T>[]): Promise<T[]> { return this.inner.query<T>(collection, filters); }
  getStore<T extends RowBase>(collection: string): StoreContract<T> { return this.inner.getStore<T>(collection); }
}
