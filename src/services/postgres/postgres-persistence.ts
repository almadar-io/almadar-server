/**
 * Postgres implementation of PersistenceAdapter (the runtime effect-handler
 * storage contract) over the same pool/tables as PostgresDataService.
 */
import type { Pool } from 'pg';
import { DatabaseError } from 'pg';
import type { PersistenceAdapter } from '@almadar/runtime';
import type { EntityRow } from '@almadar/core';
import { deserializeRow, mintId, quoteIdent, serializeValue, tableNameFor } from './rows.js';

function isUniqueViolation(error: unknown): boolean {
  return error instanceof DatabaseError && error.code === '23505';
}

export interface PostgresPersistenceOptions {
  pool: Pool;
}

export class PostgresPersistence implements PersistenceAdapter {
  private readonly pool: Pool;

  constructor(options: PostgresPersistenceOptions) {
    this.pool = options.pool;
  }

  async create(entityType: string, data: EntityRow): Promise<{ id: string }> {
    const supplied = data.id;
    const id = typeof supplied === 'string' && supplied.length > 0 ? supplied : mintId();
    const record: EntityRow = { ...data, id };
    const keys = Object.keys(record).filter((k) => record[k] !== undefined);
    const cols = keys.map(quoteIdent).join(', ');
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
    const params = keys.map((k) => serializeValue(record[k]));
    try {
      await this.pool.query(
        `INSERT INTO ${quoteIdent(tableNameFor(entityType))} (${cols}) VALUES (${placeholders})`,
        params,
      );
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new Error(`Entity ${entityType} with id ${id} already exists`);
      }
      throw error;
    }
    return { id };
  }

  async update(entityType: string, id: string, data: EntityRow): Promise<void> {
    const record: EntityRow = { ...data };
    delete record.id;
    const keys = Object.keys(record).filter((k) => record[k] !== undefined);
    if (keys.length === 0) return;
    const sets = keys.map((k, i) => `${quoteIdent(k)} = $${i + 1}`).join(', ');
    const params = [...keys.map((k) => serializeValue(record[k])), id];
    await this.pool.query(
      `UPDATE ${quoteIdent(tableNameFor(entityType))} SET ${sets} WHERE ${quoteIdent('id')} = $${params.length}`,
      params,
    );
  }

  async delete(entityType: string, id: string): Promise<void> {
    await this.pool.query(
      `DELETE FROM ${quoteIdent(tableNameFor(entityType))} WHERE ${quoteIdent('id')} = $1`,
      [id],
    );
  }

  async getById(entityType: string, id: string): Promise<EntityRow | null> {
    const result = await this.pool.query<EntityRow>(
      `SELECT * FROM ${quoteIdent(tableNameFor(entityType))} WHERE ${quoteIdent('id')} = $1`,
      [id],
    );
    if (result.rowCount === 0) return null;
    return deserializeRow(result.rows[0]);
  }

  async list(entityType: string): Promise<EntityRow[]> {
    const result = await this.pool.query<EntityRow>(
      `SELECT * FROM ${quoteIdent(tableNameFor(entityType))}`,
    );
    return result.rows.map((row) => deserializeRow(row));
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
