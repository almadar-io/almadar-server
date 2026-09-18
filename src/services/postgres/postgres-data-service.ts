/**
 * Postgres implementation of DataService, mirroring MockDataServiceAdapter /
 * FirebaseDataService contract semantics over a pg Pool.
 */
import type { Pool } from 'pg';
import { DatabaseError } from 'pg';
import type { EntityRow, FieldValue, StoreContract, StoreFilter } from '@almadar/core';
import type { DataService, PaginationOptions, PaginatedResult } from '../DataService.js';
import {
  buildPageQueries,
  buildWhere,
  deserializeRow,
  mintId,
  quoteIdent,
  serializeValue,
  tableNameFor,
  type SqlFilter,
} from './rows.js';

interface RowBase {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}

type RowInput = Partial<RowBase> & Record<string, FieldValue | undefined>;

function isUniqueViolation(error: unknown): boolean {
  return error instanceof DatabaseError && error.code === '23505';
}

export interface PostgresDataServiceOptions {
  pool: Pool;
}

export class PostgresDataService implements DataService {
  private readonly pool: Pool;

  constructor(options: PostgresDataServiceOptions) {
    this.pool = options.pool;
  }

  async list<T>(collection: string): Promise<T[]> {
    const result = await this.pool.query(`SELECT * FROM ${quoteIdent(tableNameFor(collection))}`);
    return result.rows.map((row) => deserializeRow(row));
  }

  async listPaginated<T>(
    collection: string,
    options: PaginationOptions = {},
  ): Promise<PaginatedResult<T>> {
    const page = options.page ?? 1;
    const pageSize = options.pageSize ?? 20;
    const sqlFilters: SqlFilter[] = (options.filters ?? []).map((f) => ({
      field: f.field,
      op: f.operator,
      value: f.value,
    }));
    const { sql, countSql, params } = buildPageQueries(tableNameFor(collection), sqlFilters, {
      page,
      pageSize,
      search: options.search,
      searchFields: options.searchFields,
      sortBy: options.sortBy,
      sortOrder: options.sortOrder ?? 'asc',
    });
    const [pageResult, countResult] = await Promise.all([
      this.pool.query(sql, params),
      this.pool.query<{ total: number }>(countSql, params.slice(0, params.length - 2)),
    ]);
    const total = countResult.rows[0]?.total ?? 0;
    return {
      data: pageResult.rows.map((row) => deserializeRow(row) as T),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async getById<T>(collection: string, id: string): Promise<T | null> {
    const result = await this.pool.query(
      `SELECT * FROM ${quoteIdent(tableNameFor(collection))} WHERE ${quoteIdent('id')} = $1`,
      [id],
    );
    if (result.rowCount === 0) return null;
    return deserializeRow(result.rows[0]);
  }

  async create<T extends RowBase>(collection: string, data: Partial<T>): Promise<T> {
    const now = new Date();
    const supplied = (data as RowInput).id;
    const id = typeof supplied === 'string' && supplied.length > 0 ? supplied : mintId();
    const record: EntityRow = {
      ...(data as RowInput),
      id,
      createdAt: now,
      updatedAt: now,
    };
    const keys = Object.keys(record).filter((k) => record[k] !== undefined);
    const cols = keys.map(quoteIdent).join(', ');
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
    const params = keys.map((k) => serializeValue(record[k]));
    try {
      const result = await this.pool.query(
        `INSERT INTO ${quoteIdent(tableNameFor(collection))} (${cols}) VALUES (${placeholders}) RETURNING *`,
        params,
      );
      return deserializeRow(result.rows[0]);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new Error(`Entity ${collection} with id ${id} already exists`);
      }
      throw error;
    }
  }

  async update<T extends RowBase>(collection: string, id: string, data: Partial<T>): Promise<T | null> {
    const record: EntityRow = { ...(data as RowInput) };
    delete record.id;
    delete record.createdAt;
    record.updatedAt = new Date();
    const keys = Object.keys(record).filter((k) => record[k] !== undefined);
    if (keys.length === 0) {
      return this.getById<T>(collection, id);
    }
    const sets = keys.map((k, i) => `${quoteIdent(k)} = $${i + 1}`).join(', ');
    const params = [...keys.map((k) => serializeValue(record[k])), id];
    const result = await this.pool.query(
      `UPDATE ${quoteIdent(tableNameFor(collection))} SET ${sets} WHERE ${quoteIdent('id')} = $${params.length} RETURNING *`,
      params,
    );
    if (result.rowCount === 0) return null;
    return deserializeRow(result.rows[0]);
  }

  async delete(collection: string, id: string): Promise<boolean> {
    const result = await this.pool.query(
      `DELETE FROM ${quoteIdent(tableNameFor(collection))} WHERE ${quoteIdent('id')} = $1`,
      [id],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async query<T>(collection: string, filters: StoreFilter<T>[]): Promise<T[]> {
    const sqlFilters: SqlFilter[] = filters.map((f) => ({
      field: f.field,
      op: f.op,
      value: f.value,
    }));
    const { where, params } = buildWhere(sqlFilters);
    const result = await this.pool.query(
      `SELECT * FROM ${quoteIdent(tableNameFor(collection))}${where}`,
      params,
    );
    return result.rows.map((row) => deserializeRow(row));
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

  async close(): Promise<void> {
    await this.pool.end();
  }
}
