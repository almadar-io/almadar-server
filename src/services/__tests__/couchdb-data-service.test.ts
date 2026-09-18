import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { CouchDBClient, CouchDoc } from '../couchdb/rows.js';
import { CouchDBDataService } from '../couchdb/couchdb-data-service.js';

interface Task {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  title: string;
  done?: boolean;
  minutes?: number;
  tags?: string[];
}

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
            const stored: CouchDoc = { ...(doc as CouchDoc), _id: id, _rev: rev };
            docs.set(id, stored);
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
          find: vi.fn(async ({ selector }: { selector: Record<string, Record<string, unknown>> }) => {
            const matched = [...docs.values()].filter((doc) =>
              Object.entries(selector).every(([field, cond]) =>
                Object.entries(cond).every(([op, value]) => {
                  const fieldValue: unknown = doc[field];
                  switch (op) {
                    case '$eq':
                      return fieldValue === value;
                    case '$ne':
                      return fieldValue !== value;
                    case '$lt':
                      return (fieldValue as number) < (value as number);
                    case '$lte':
                      return (fieldValue as number) <= (value as number);
                    case '$gt':
                      return (fieldValue as number) > (value as number);
                    case '$gte':
                      return (fieldValue as number) >= (value as number);
                    case '$in':
                      return Array.isArray(value) && value.includes(fieldValue);
                    case '$nin':
                      return Array.isArray(value) && !value.includes(fieldValue);
                    default:
                      return true;
                  }
                }),
              ),
            );
            return { docs: matched, bookmark: 'done' };
          }),
        };
        dbs.set(name, db);
      }
      return db;
    },
  };
  return { client, dbs, dbCreate };
}

let service: CouchDBDataService;
let dbs: Map<string, FakeDb>;

beforeEach(() => {
  vi.clearAllMocks();
  const made = makeClient();
  service = new CouchDBDataService({ client: made.client });
  dbs = made.dbs;
});

function tasksDb(): FakeDb {
  return dbs.get('tasks') as FakeDb;
}

describe('CouchDBDataService naming', () => {
  it('maps entityType to the postgres-owned database name', async () => {
    await service.create<Task>('TimeEntry', { title: 'T' });
    expect(dbs.has('time_entries')).toBe(true);
  });
});

describe('CouchDBDataService.create', () => {
  it('honors a supplied non-empty string id and returns the full row with Date timestamps', async () => {
    const row = await service.create<Task>('Task', { id: 'task-1', title: 'T' });
    expect(row.id).toBe('task-1');
    expect(row.createdAt).toBeInstanceOf(Date);
    expect(row.updatedAt).toBeInstanceOf(Date);
    const stored = tasksDb().docs.get('task-1');
    expect(stored).toBeDefined();
    expect(typeof stored?.createdAt).toBe('string'); // ISO in the doc
    expect(stored?._id).toBe('task-1');
    expect(stored?._rev).toBeTruthy();
  });

  it('mints a uuid when no id is supplied', async () => {
    const row = await service.create<Task>('Task', { title: 'No id' });
    expect(row.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(tasksDb().docs.has(row.id)).toBe(true);
  });

  it('throws on duplicate id (409 conflict)', async () => {
    await service.create<Task>('Task', { id: 'dupe', title: 'T' });
    await expect(service.create<Task>('Task', { id: 'dupe', title: 'T2' })).rejects.toThrow(
      'Entity Task with id dupe already exists',
    );
  });
});

describe('CouchDBDataService.getById / list', () => {
  it('returns null on a miss', async () => {
    expect(await service.getById<Task>('Task', 'missing')).toBeNull();
  });

  it('strips _id/_rev from returned rows and deserializes timestamps', async () => {
    await service.create<Task>('Task', { id: 'task-1', title: 'T' });
    const row = await service.getById<Task>('Task', 'task-1');
    expect(row?.title).toBe('T');
    expect(row?.createdAt).toBeInstanceOf(Date);
    expect(row).not.toHaveProperty('_rev');
    expect(row).not.toHaveProperty('_id');
  });

  it('lists all rows without couch internals', async () => {
    await service.create<Task>('Task', { id: 'a', title: 'A' });
    await service.create<Task>('Task', { id: 'b', title: 'B' });
    const rows = await service.list<Task>('Task');
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => !('_rev' in r) && !('_id' in r))).toBe(true);
  });
});

describe('CouchDBDataService.update', () => {
  it('returns null when no doc matches', async () => {
    expect(await service.update<Task>('Task', 'missing', { title: 'X' })).toBeNull();
  });

  it('updates the doc, refreshes updatedAt, and keeps createdAt', async () => {
    const created = await service.create<Task>('Task', { id: 'task-1', title: 'Old' });
    const updated = await service.update<Task>('Task', 'task-1', { title: 'New' });
    expect(updated?.title).toBe('New');
    expect(updated?.id).toBe('task-1');
    expect(updated?.updatedAt.getTime()).toBeGreaterThanOrEqual(created.updatedAt.getTime());
    const stored = tasksDb().docs.get('task-1');
    expect(stored?.title).toBe('New');
    expect(stored?._rev).toBeTruthy();
  });
});

describe('CouchDBDataService.delete', () => {
  it('returns true when a doc was deleted, false on a miss', async () => {
    await service.create<Task>('Task', { id: 'task-1', title: 'T' });
    expect(await service.delete('Task', 'task-1')).toBe(true);
    expect(await service.delete('Task', 'task-1')).toBe(false);
  });
});

describe('CouchDBDataService.query', () => {
  beforeEach(async () => {
    await service.create<Task>('Task', { id: 'a', title: 'alpha entry', minutes: 10, done: true, tags: ['x'] });
    await service.create<Task>('Task', { id: 'b', title: 'beta entry', minutes: 20, done: false, tags: ['y'] });
    await service.create<Task>('Task', { id: 'c', title: 'gamma', minutes: 30, done: false });
  });

  it('pushes Mango-expressible ops to _find', async () => {
    const rows = await service.query<Task>('Task', [{ field: 'minutes', op: '>', value: 15 }]);
    expect(rows.map((r) => r.id).sort()).toEqual(['b', 'c']);
    expect(tasksDb().find).toHaveBeenCalled();
  });

  it('applies contains in memory after _find', async () => {
    const contains = await service.query<Task>('Task', [{ field: 'title', op: 'contains', value: 'ENTRY' }]);
    expect(contains.map((r) => r.id).sort()).toEqual(['a', 'b']);
    const eq = await service.query<Task>('Task', [{ field: 'done', op: '==', value: true }]);
    expect(eq.map((r) => r.id)).toEqual(['a']);
  });
});

describe('filter matrix (rows.applyFilterCondition)', () => {
  it('supports array-contains / array-contains-any and treats unknown ops as permissive', async () => {
    const { applyFilterCondition } = await import('../couchdb/rows.js');
    expect(applyFilterCondition(['x', 'y'], 'array-contains', 'x')).toBe(true);
    expect(applyFilterCondition(['x', 'y'], 'array-contains-any', ['z', 'y'])).toBe(true);
    expect(applyFilterCondition('anything', 'bogus-op', 'zzz')).toBe(true);
  });

  it('filters listPaginated via the matrix (array-contains spelling)', async () => {
    await service.create<Task>('Task', { id: 'a', title: 'alpha', done: true, tags: ['x'] });
    await service.create<Task>('Task', { id: 'b', title: 'beta', done: false, tags: ['y'] });
    const result = await service.listPaginated<Task>('Task', {
      filters: [
        { field: 'done', operator: '==', value: true },
        { field: 'tags', operator: 'array-contains', value: 'x' },
      ],
    });
    expect(result.data.map((r) => r.id)).toEqual(['a']);
  });
});

describe('CouchDBDataService.listPaginated', () => {
  it('returns the PaginatedResult shape with search, sort, and pages', async () => {
    for (let i = 1; i <= 5; i++) {
      await service.create<Task>('Task', { id: `p${i}`, title: `page-${i}`, minutes: i });
    }
    const page1 = await service.listPaginated<Task>('Task', {
      page: 1,
      pageSize: 2,
      search: 'page-',
      searchFields: ['title'],
      sortBy: 'minutes',
      sortOrder: 'asc',
    });
    expect(page1.total).toBe(5);
    expect(page1.totalPages).toBe(3);
    expect(page1.data).toHaveLength(2);
    expect(page1.data[0].title).toBe('page-1');
  });

  it('sorts nulls last', async () => {
    await service.create<Task>('Task', { id: 'with', title: 'A', minutes: 5 });
    await service.create<Task>('Task', { id: 'without', title: 'B' });
    const result = await service.listPaginated<Task>('Task', { sortBy: 'minutes', sortOrder: 'asc' });
    expect(result.data.map((r) => r.id)).toEqual(['with', 'without']);
  });
});

describe('CouchDBDataService.getStore', () => {
  it('returns a StoreContract that throws on update of a missing row', async () => {
    const store = service.getStore<Task>('Task');
    await expect(store.update('missing', { title: 'X' })).rejects.toThrow('Entity missing not found in Task');
  });
});
