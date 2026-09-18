/**
 * CouchDB implementation of PersistenceAdapter (the runtime effect-handler
 * storage contract) over the same client/databases as CouchDBDataService.
 */
import type { RequestError } from 'nano';
import type { PersistenceAdapter } from '@almadar/runtime';
import type { EntityRow } from '@almadar/core';
import {
  databaseNameFor,
  docToRow,
  mintId,
  serializeRow,
  type CouchDBClient,
  type CouchDBDatabase,
  type CouchDoc,
} from './rows.js';

function isNotFound(error: unknown): boolean {
  return (error as RequestError).statusCode === 404;
}

function isConflict(error: unknown): boolean {
  return (error as RequestError).statusCode === 409;
}

export interface CouchDBPersistenceOptions {
  client: CouchDBClient;
}

export class CouchDBPersistence implements PersistenceAdapter {
  private readonly client: CouchDBClient;
  private readonly ensured = new Set<string>();

  constructor(options: CouchDBPersistenceOptions) {
    this.client = options.client;
  }

  private dbFor(entityType: string): CouchDBDatabase<CouchDoc> {
    return this.client.use(databaseNameFor(entityType));
  }

  private async ensureDatabase(entityType: string): Promise<void> {
    const name = databaseNameFor(entityType);
    if (this.ensured.has(name)) return;
    try {
      await this.client.db.create(name);
    } catch (error) {
      if (!isConflict(error)) throw error; // database already exists
    }
    this.ensured.add(name);
  }

  async create(entityType: string, data: EntityRow): Promise<{ id: string }> {
    await this.ensureDatabase(entityType);
    const supplied = data.id;
    const id = typeof supplied === 'string' && supplied.length > 0 ? supplied : mintId();
    const doc = { ...serializeRow({ ...data, id }), _id: id };
    try {
      await this.dbFor(entityType).insert(doc);
    } catch (error) {
      if (isConflict(error)) {
        throw new Error(`Entity ${entityType} with id ${id} already exists`);
      }
      throw error;
    }
    return { id };
  }

  async update(entityType: string, id: string, data: EntityRow): Promise<void> {
    const db = this.dbFor(entityType);
    // Refetch-before-write (no _rev shadow): the current rev travels with the doc only.
    const current = await this.getDoc(db, id);
    if (!current) return; // mirror postgres: update on a miss is a silent no-op
    const record: EntityRow = { ...data };
    delete record.id;
    const next: CouchDoc = {
      ...current,
      ...serializeRow(record),
      _id: current._id,
      _rev: current._rev,
    };
    await db.insert(next);
  }

  async delete(entityType: string, id: string): Promise<void> {
    const db = this.dbFor(entityType);
    const current = await this.getDoc(db, id);
    if (!current) return;
    await db.destroy(current._id, current._rev);
  }

  private async getDoc(db: CouchDBDatabase<CouchDoc>, id: string): Promise<CouchDoc | null> {
    try {
      return await db.get(id);
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  async getById(entityType: string, id: string): Promise<EntityRow | null> {
    try {
      const doc = await this.dbFor(entityType).get(id);
      return docToRow<EntityRow>(doc);
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  async list(entityType: string): Promise<EntityRow[]> {
    const result = await this.dbFor(entityType).list({ include_docs: true });
    return result.rows
      .map((row) => row.doc)
      .filter((doc): doc is CouchDoc => doc !== undefined)
      .map((doc) => docToRow<EntityRow>(doc));
  }
}
