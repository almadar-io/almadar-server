/**
 * CouchDB implementation of DataService, mirroring MockDataServiceAdapter /
 * PostgresDataService contract semantics over a nano client
 * (one database per collection, schemaless docs).
 */
import type { MangoSelector, RequestError } from 'nano';
import type { EntityRow, FieldValue, StoreContract, StoreFilter } from '@almadar/core';
import type { DataService, PaginationOptions, PaginatedResult } from '../DataService.js';
import {
  applyFilterCondition,
  databaseNameFor,
  docToRow,
  mangoOperatorFor,
  mintId,
  paginateRows,
  serializeRow,
  type CouchDBClient,
  type CouchDoc,
  type CouchFilter,
} from './rows.js';

interface RowBase {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}

type RowInput = Partial<RowBase> & Record<string, FieldValue | undefined>;

function isNotFound(error: unknown): boolean {
  return (error as RequestError).statusCode === 404;
}

function isConflict(error: unknown): boolean {
  return (error as RequestError).statusCode === 409;
}

export interface CouchDBDataServiceOptions {
  client: CouchDBClient;
}

export class CouchDBDataService implements DataService {
  private readonly client: CouchDBClient;
  private readonly ensured = new Set<string>();

  constructor(options: CouchDBDataServiceOptions) {
    this.client = options.client;
  }

  private dbFor(collection: string) {
    return this.client.use(databaseNameFor(collection));
  }

  private async ensureDatabase(collection: string): Promise<void> {
    const name = databaseNameFor(collection);
    if (this.ensured.has(name)) return;
    try {
      await this.client.db.create(name);
    } catch (error) {
      if (!isConflict(error)) throw error; // database already exists
    }
    this.ensured.add(name);
  }

  async list<T>(collection: string): Promise<T[]> {
    const result = await this.dbFor(collection).list({ include_docs: true });
    return result.rows
      .map((row) => row.doc)
      .filter((doc): doc is CouchDoc => doc !== undefined)
      .map((doc) => docToRow<T & object>(doc));
  }

  async listPaginated<T>(
    collection: string,
    options: PaginationOptions = {},
  ): Promise<PaginatedResult<T>> {
    const rows = await this.list<T>(collection);
    return paginateRows(rows, options);
  }

  async getById<T>(collection: string, id: string): Promise<T | null> {
    try {
      const doc = await this.dbFor(collection).get(id);
      return docToRow<T & object>(doc);
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  async create<T extends RowBase>(collection: string, data: Partial<T>): Promise<T> {
    await this.ensureDatabase(collection);
    const now = new Date();
    const supplied = (data as RowInput).id;
    const id = typeof supplied === 'string' && supplied.length > 0 ? supplied : mintId();
    const doc = {
      ...serializeRow({ ...(data as RowInput), id } as EntityRow),
      _id: id,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
    try {
      await this.dbFor(collection).insert(doc);
    } catch (error) {
      if (isConflict(error)) {
        throw new Error(`Entity ${collection} with id ${id} already exists`);
      }
      throw error;
    }
    return { ...data, id, createdAt: now, updatedAt: now } as T;
  }

  async update<T extends RowBase>(collection: string, id: string, data: Partial<T>): Promise<T | null> {
    const db = this.dbFor(collection);
    let current: CouchDoc;
    try {
      current = await db.get(id);
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
    // Refetch-before-write (no _rev shadow): the current rev travels with the doc only.
    const record: RowInput = { ...(data as RowInput) };
    delete record.id;
    delete record.createdAt;
    record.updatedAt = new Date();
    const keys = Object.keys(record).filter((k) => record[k] !== undefined);
    if (keys.length === 0) {
      return this.getById<T>(collection, id);
    }
    const next: CouchDoc = {
      ...current,
      ...serializeRow(record as EntityRow),
      _id: current._id,
      _rev: current._rev,
    };
    await db.insert(next);
    return docToRow<T & object>(next);
  }

  async delete(collection: string, id: string): Promise<boolean> {
    const db = this.dbFor(collection);
    let current: CouchDoc;
    try {
      current = await db.get(id);
    } catch (error) {
      if (isNotFound(error)) return false;
      throw error;
    }
    await db.destroy(current._id, current._rev);
    return true;
  }

  async query<T>(collection: string, filters: StoreFilter<T>[]): Promise<T[]> {
    const couchFilters: CouchFilter[] = filters.map((f) => ({
      field: f.field as string,
      op: f.op,
      value: f.value,
    }));
    const selector: MangoSelector = {};
    const memoryFilters: CouchFilter[] = [];
    for (const filter of couchFilters) {
      const mangoOp = mangoOperatorFor(filter.op);
      if (mangoOp) {
        selector[filter.field] = { [mangoOp]: filter.value };
      } else {
        memoryFilters.push(filter);
      }
    }

    let rows: T[];
    if (Object.keys(selector).length > 0) {
      const response = await this.dbFor(collection).find({ selector });
      rows = response.docs.map((doc) => docToRow<T & object>(doc));
    } else {
      rows = await this.list<T>(collection);
    }

    for (const filter of memoryFilters) {
      rows = rows.filter((item) => {
        const value: unknown = Reflect.get(item as object, filter.field);
        return applyFilterCondition(value, filter.op, filter.value);
      });
    }
    return rows;
  }

  getStore<T extends RowBase>(collection: string): StoreContract<T> {
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
