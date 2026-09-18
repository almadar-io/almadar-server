/**
 * Shared internals for the CouchDB adapters — database naming, id minting,
 * doc (de)serialization (Dates → ISO strings), the in-memory filter matrix,
 * and paginated search/sort/slice. Used by BOTH CouchDBDataService and
 * CouchDBPersistence (no duplication).
 */
import type { MangoSelector } from 'nano';
import type { EntityRow, FieldValue } from '@almadar/core';
import type { PaginationOptions, PaginatedResult } from '../DataService.js';

// Database naming stays single-owned by the postgres rows module
// (same deterministic entityType → name mapping, reused verbatim).
import { tableNameFor as databaseNameFor, mintId } from '../postgres/rows.js';

export { databaseNameFor, mintId };

export interface CouchDoc {
  _id: string;
  _rev: string;
  [key: string]: FieldValue | undefined;
}

/**
 * Narrow structural view of the nano client surface the adapters use.
 * nano's `ServerScope` satisfies this structurally; tests can supply a double
 * implementing it directly (no casts).
 */
export interface CouchDBDatabase<D extends CouchDoc> {
  insert(doc: EntityRow & { _id: string; _rev?: string }): Promise<unknown>;
  get(docname: string): Promise<D>;
  destroy(docname: string, rev: string): Promise<unknown>;
  list(params: { include_docs: boolean }): Promise<{ rows: { doc?: D }[] }>;
  find(query: { selector: MangoSelector }): Promise<{ docs: D[] }>;
}

export interface CouchDBClient {
  db: { create(name: string): Promise<unknown> };
  use(name: string): CouchDBDatabase<CouchDoc>;
}

/** EntityRow → CouchDB doc body: undefined dropped, Date → ISO at the top level. */
export function serializeRow(row: EntityRow): EntityRow {
  const doc: EntityRow = {};
  for (const [key, value] of Object.entries(row)) {
    if (value === undefined) continue;
    doc[key] = value instanceof Date ? value.toISOString() : value;
  }
  return doc;
}

/** CouchDB doc → row: strip _id/_rev, ISO timestamps back to Date. */
export function docToRow<T extends object>(doc: CouchDoc): T {
  const { _id: _docId, _rev: _docRev, ...rest } = doc;
  for (const key of ['createdAt', 'updatedAt']) {
    const value: unknown = Reflect.get(rest, key);
    if (typeof value === 'string') Reflect.set(rest, key, new Date(value));
  }
  return rest as T;
}

export interface CouchFilter {
  field: string;
  op: string;
  value: unknown;
}

/** In-memory filter matrix, mirroring DataService.applyFilterCondition + postgres 'contains'. */
export function applyFilterCondition(value: unknown, operator: string, filterValue: unknown): boolean {
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
    case 'in':
      return Array.isArray(filterValue) && filterValue.includes(value);
    case 'not-in':
      return Array.isArray(filterValue) && !filterValue.includes(value);
    case 'contains':
      return (
        typeof value === 'string' &&
        typeof filterValue === 'string' &&
        value.toLowerCase().includes(filterValue.toLowerCase())
      );
    case 'array-contains':
      return Array.isArray(value) && value.includes(filterValue);
    case 'array-contains-any':
      return (
        Array.isArray(value) &&
        Array.isArray(filterValue) &&
        filterValue.some((v: unknown) => value.includes(v))
      );
    default:
      return true;
  }
}

export function applyFilters<T>(rows: T[], filters: readonly CouchFilter[]): T[] {
  if (filters.length === 0) return rows;
  return rows.filter((row) =>
    filters.every((filter) => {
      const value: unknown = Reflect.get(row as object, filter.field);
      return applyFilterCondition(value, filter.op, filter.value);
    }),
  );
}

/**
 * Ops pushed into Mango `_find`; everything else (`contains`,
 * `array-contains`, `array-contains-any`, unknown ops) falls back to the
 * in-memory matrix in applyFilterCondition.
 */
export function mangoOperatorFor(op: string): '$eq' | '$ne' | '$lt' | '$lte' | '$gt' | '$gte' | '$in' | '$nin' | null {
  switch (op) {
    case '==':
      return '$eq';
    case '!=':
      return '$ne';
    case '<':
      return '$lt';
    case '<=':
      return '$lte';
    case '>':
      return '$gt';
    case '>=':
      return '$gte';
    case 'in':
      return '$in';
    case 'not-in':
      return '$nin';
    default:
      return null;
  }
}

const rowField = (item: unknown, key: string): unknown => Reflect.get(item as object, key);

/** Search + nulls-last sort + slice, mirroring MockDataServiceAdapter pagination semantics. */
export function paginateRows<T>(rows: T[], options: PaginationOptions): PaginatedResult<T> {
  const page = options.page ?? 1;
  const pageSize = options.pageSize ?? 20;
  const { search, searchFields, sortBy, sortOrder = 'asc' } = options;

  let items = applyFilters(rows, (options.filters ?? []).map((f) => ({ field: f.field, op: f.operator, value: f.value })));

  if (search && search.trim()) {
    const searchLower = search.toLowerCase();
    items = items.filter((item) => {
      const keys = Object.keys(item as object);
      const fieldsToSearch = searchFields || keys;
      return fieldsToSearch.some((field) => {
        const value = rowField(item, field);
        if (value === null || value === undefined) return false;
        return String(value).toLowerCase().includes(searchLower);
      });
    });
  }

  if (sortBy) {
    items = [...items].sort((a, b) => {
      const aVal = rowField(a, sortBy);
      const bVal = rowField(b, sortBy);
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
