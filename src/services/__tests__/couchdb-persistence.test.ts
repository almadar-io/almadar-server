import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { CouchDBClient, CouchDoc } from '../couchdb/rows.js';
import { CouchDBPersistence } from '../couchdb/couchdb-persistence.js';

function notFound(): Error & { statusCode: number } {
  const err = new Error('missing') as Error & { statusCode: number };
  err.statusCode = 404;
  return err;
}

function conflict(): Error & { statusCode: number } {
  const err = new Error('Document update conflict') as Error & { statusCode: number };
  err.statusCode = 409;
  return err;
}

interface FakeDb {
  docs: Map<string, CouchDoc>;
  insert: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
  list: ReturnType<typeof vi.fn>;
  find: ReturnType<typeof vi.fn>;
}

function makeClient() {
  const dbs = new Map<string, FakeDb>();
  const dbCreate = vi.fn(async (name: string) => {
    if (dbs.has(name)) throw conflict();
    return { ok: true };
  });
  const client: CouchDBClient = {
    db: { create: dbCreate },
    use: (name: string) => {
      let db = dbs.get(name);
      if (!db) {
        const docs = new Map<string, CouchDoc>();
        db = {
          docs,
          insert: vi.fn(async (doc: Record<string, unknown>) => {
            const id = doc._id as string;
            const existing = docs.get(id);
            if (existing && existing._rev !== doc._rev) throw conflict();
            const rev = `2-${id}`;
            docs.set(id, { ...(doc as CouchDoc), _id: id, _rev: rev });
            return { ok: true, id, rev };
          }),
          get: vi.fn(async (id: string) => {
            const doc = docs.get(id);
            if (!doc) throw notFound();
            return doc;
          }),
          destroy: vi.fn(async (id: string) => {
            docs.delete(id);
            return { ok: true, id, rev: '3-x' };
          }),
          list: vi.fn(async () => ({
            total_rows: docs.size,
            offset: 0,
            rows: [...docs.values()].map((doc) => ({ id: doc._id, key: doc._id, value: { rev: doc._rev }, doc })),
          })),
          find: vi.fn(async () => ({ docs: [], bookmark: 'done' })),
        };
        dbs.set(name, db);
      }
      return db;
    },
  };
  return { client, dbs };
}

let adapter: CouchDBPersistence;
let dbs: Map<string, FakeDb>;

beforeEach(() => {
  vi.clearAllMocks();
  const made = makeClient();
  adapter = new CouchDBPersistence({ client: made.client });
  dbs = made.dbs;
});

describe('CouchDBPersistence naming', () => {
  it('uses the postgres-owned database name per entityType', async () => {
    await adapter.create('TimeEntry', { id: 't1' });
    expect(dbs.has('time_entries')).toBe(true);
  });
});

describe('CouchDBPersistence.create', () => {
  it('honors a supplied id and returns it', async () => {
    const { id } = await adapter.create('User', { id: 'user-1', name: 'Ada' });
    expect(id).toBe('user-1');
  });

  it('mints a uuid when no id is supplied', async () => {
    const { id } = await adapter.create('User', { name: 'No id' });
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('throws on duplicate id (409 conflict)', async () => {
    await adapter.create('User', { id: 'dupe', name: 'Ada' });
    await expect(adapter.create('User', { id: 'dupe' })).rejects.toThrow(
      'Entity User with id dupe already exists',
    );
  });
});

describe('CouchDBPersistence.getById / list', () => {
  it('returns null on a miss', async () => {
    expect(await adapter.getById('User', 'missing')).toBeNull();
  });

  it('returns rows without _id/_rev and deserializes Date timestamps', async () => {
    await adapter.create('User', { id: 'user-1', name: 'Ada', createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01') });
    const row = await adapter.getById('User', 'user-1');
    expect(row?.name).toBe('Ada');
    expect(row).not.toHaveProperty('_rev');
    expect(row).not.toHaveProperty('_id');
    expect(row?.createdAt).toBeInstanceOf(Date);
    expect(row?.updatedAt).toBeInstanceOf(Date);
  });

  it('lists all rows', async () => {
    await adapter.create('User', { id: 'a' });
    await adapter.create('User', { id: 'b' });
    expect(await adapter.list('User')).toHaveLength(2);
  });
});

describe('CouchDBPersistence.update / delete', () => {
  it('update writes the merged doc and keeps _rev bookkeeping', async () => {
    await adapter.create('User', { id: 'user-1', name: 'Ada' });
    await adapter.update('User', 'user-1', { name: 'Grace' });
    expect((await adapter.getById('User', 'user-1'))?.name).toBe('Grace');
  });

  it('update on a miss is a silent no-op (mirrors postgres)', async () => {
    await expect(adapter.update('User', 'missing', { name: 'X' })).resolves.toBeUndefined();
  });

  it('delete removes the doc and is a no-op on a miss', async () => {
    await adapter.create('User', { id: 'user-1', name: 'Ada' });
    await adapter.delete('User', 'user-1');
    expect(await adapter.getById('User', 'user-1')).toBeNull();
    await expect(adapter.delete('User', 'user-1')).resolves.toBeUndefined();
  });
});
