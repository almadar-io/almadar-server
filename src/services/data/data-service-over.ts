/**
 * `DataService` over a `PersistenceAdapter`: the compiled apps' data API as one facade over the
 * same storage the runtime path uses. The facade owns the DataService semantics (timestamps on
 * create/update, `null` for an update of a missing row, `delete` reporting whether a row existed);
 * the adapter owns storage, and its native `query` / `listPage` when it has them.
 */
import type { PersistenceAdapter } from '@almadar/runtime';
import type { EntityRow, FieldValue, StoreContract, StoreFilter } from '@almadar/core';
import type { DataService, PaginatedResult, PaginationOptions } from '../DataService.js';
import { filterRows, pageRows } from './row-query.js';

interface Timestamped {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}

/** Rows are stored as `EntityRow`; callers name their shape. The one boundary between the two. */
function asEntity<T>(row: EntityRow): T {
  return row as T;
}

function asRow<T extends object>(value: T): EntityRow {
  const row: EntityRow = {};
  for (const [key, field] of Object.entries(value)) {
    const v: FieldValue | undefined = field;
    if (v !== undefined) row[key] = v;
  }
  return row;
}

function storeFilters<T>(filters: readonly StoreFilter<T>[]): StoreFilter<EntityRow>[] {
  return filters.map((f) => ({ field: f.field, op: f.op, value: f.value }));
}

export function dataServiceOver(adapter: PersistenceAdapter): DataService {
  const createRow = async (collection: string, fields: EntityRow): Promise<EntityRow> => {
    const now = new Date();
    const row: EntityRow = { ...fields, createdAt: now, updatedAt: now };
    const { id } = await adapter.create(collection, row);
    return { ...row, id };
  };

  const service: DataService = {
    async list<T>(collection: string): Promise<T[]> {
      return (await adapter.list(collection)).map((row) => asEntity<T>(row));
    },

    async listPaginated<T>(collection: string, options: PaginationOptions = {}): Promise<PaginatedResult<T>> {
      const page = options.page ?? 1;
      const pageSize = options.pageSize ?? 20;
      const request = {
        page,
        pageSize,
        filters: (options.filters ?? []).map((f): StoreFilter<EntityRow> => ({ field: f.field, op: f.operator, value: f.value })),
        ...(options.search !== undefined ? { search: options.search } : {}),
        ...(options.searchFields !== undefined ? { searchFields: options.searchFields } : {}),
        ...(options.sortBy !== undefined ? { sortBy: options.sortBy } : {}),
        sortOrder: options.sortOrder ?? 'asc',
      };
      const result = adapter.listPage ? await adapter.listPage(collection, request) : pageRows(await adapter.list(collection), request);
      return { data: result.rows.map((row) => asEntity<T>(row)), total: result.total, page, pageSize, totalPages: Math.ceil(result.total / pageSize) };
    },

    async getById<T>(collection: string, id: string): Promise<T | null> {
      const row = await adapter.getById(collection, id);
      return row === null ? null : asEntity<T>(row);
    },

    async create<T extends Timestamped>(collection: string, data: Partial<T>): Promise<T> {
      return asEntity<T>(await createRow(collection, asRow(data)));
    },

    async update<T extends Timestamped>(collection: string, id: string, data: Partial<T>): Promise<T | null> {
      const current = await adapter.getById(collection, id);
      if (current === null) return null;
      const changes = asRow(data);
      delete changes.id;
      delete changes.createdAt;
      if (Object.keys(changes).length === 0) return asEntity<T>(current);
      const next: EntityRow = { ...changes, updatedAt: new Date() };
      await adapter.update(collection, id, next);
      return asEntity<T>({ ...current, ...next, id });
    },

    async delete(collection: string, id: string): Promise<boolean> {
      if ((await adapter.getById(collection, id)) === null) return false;
      await adapter.delete(collection, id);
      return true;
    },

    async query<T>(collection: string, filters: StoreFilter<T>[]): Promise<T[]> {
      const rowFilters = storeFilters(filters);
      const rows = adapter.query ? await adapter.query(collection, rowFilters) : filterRows(await adapter.list(collection), rowFilters);
      return rows.map((row) => asEntity<T>(row));
    },

    getStore<T extends Timestamped>(collection: string): StoreContract<T> {
      return {
        getById: (id) => service.getById<T>(collection, id),
        create: async (data) => asEntity<T>(await createRow(collection, asRow(data))),
        async update(id, data) {
          const result = await service.update<T>(collection, id, data);
          if (!result) throw new Error(`Entity ${id} not found in ${collection}`);
          return result;
        },
        async delete(id) { await service.delete(collection, id); },
        query: (filters) => service.query<T>(collection, filters),
      };
    },
  };
  return service;
}
