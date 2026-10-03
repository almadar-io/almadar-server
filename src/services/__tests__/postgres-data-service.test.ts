import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

const queryMocks: Mock[] = [];

vi.mock('pg', async () => {
  const { vi: v } = await import('vitest');
  class DatabaseError extends Error {
    code?: string;
    constructor(message?: string) {
      super(message);
      this.name = 'DatabaseError';
    }
  }
  class Pool {
    query = v.fn();
    end = v.fn(() => Promise.resolve());
    constructor() {
      queryMocks.push(this.query);
    }
  }
  return { Pool, DatabaseError };
});

import { Pool, DatabaseError } from 'pg';
import { PostgresDataService } from '../postgres/postgres-data-service.js';

interface Task {
  id: string;
  createdAt: string;
  updatedAt: string;
  title: string;
  done?: boolean;
  tags?: string[];
}

let pool: Pool;
let queryMock: Mock;

beforeEach(() => {
  vi.clearAllMocks();
  queryMocks.length = 0;
  pool = new Pool();
  queryMock = queryMocks[0];
});

function makeService(): PostgresDataService {
  return new PostgresDataService({ pool });
}

function queryResult(rows: object[], rowCount = rows.length) {
  return { rows, rowCount, command: '', oid: 0, fields: [] };
}

describe('PostgresDataService.create', () => {
  it('honors a supplied non-empty string id and returns the entity with timestamps', async () => {
    const service = makeService();
    queryMock.mockResolvedValue(queryResult([], 1));
    const row = await service.create<Task>('Task', { id: 'task-1', title: 'T' });
    expect(row).toMatchObject({ id: 'task-1', title: 'T' });
    expect(row.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(row.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    const [sql, params] = queryMock.mock.calls[0];
    expect(sql).toContain('INSERT INTO "tasks"');
    expect(params).toContain('task-1');
  });

  it('throws on duplicate id (unique violation)', async () => {
    const service = makeService();
    const err = new DatabaseError('duplicate key', 0, 'error');
    err.code = '23505';
    queryMock.mockRejectedValue(err);
    await expect(service.create<Task>('Task', { id: 'dupe', title: 'T' })).rejects.toThrow(
      'Entity Task with id dupe already exists',
    );
  });

  it('mints a uuid when no id is supplied', async () => {
    const service = makeService();
    queryMock.mockResolvedValue(queryResult([], 1));
    const row = await service.create<Task>('Task', { title: 'No id' });
    const params: unknown[] = queryMock.mock.calls[0][1];
    expect(params).toHaveLength(4); // title, createdAt, updatedAt, id
    expect(row.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(params).toContain(row.id);
  });
});

describe('PostgresDataService.update', () => {
  it('returns null when no row matches, and writes nothing', async () => {
    const service = makeService();
    queryMock.mockResolvedValue(queryResult([], 0));
    const result = await service.update<Task>('Task', 'missing', { title: 'X' });
    expect(result).toBeNull();
    expect(queryMock).toHaveBeenCalledTimes(1);
    expect(queryMock.mock.calls[0][0]).toContain('SELECT');
  });

  it('reads the row, then issues UPDATE ... WHERE id with a refreshed updatedAt', async () => {
    const service = makeService();
    queryMock
      .mockResolvedValueOnce(queryResult([{ id: 'task-1', title: 'Old', createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01') }]))
      .mockResolvedValueOnce(queryResult([], 1));
    const result = await service.update<Task>('Task', 'task-1', { title: 'New' });
    expect(result).toMatchObject({ id: 'task-1', title: 'New' });
    expect(result && Date.parse(result.updatedAt)).toBeGreaterThan(new Date('2026-01-01').getTime());
    const [sql, params] = queryMock.mock.calls[1];
    expect(sql).toContain('UPDATE "tasks" SET');
    expect(sql).toContain('WHERE "id" = $');
    expect(params?.[params.length - 1]).toBe('task-1');
  });
});

describe('PostgresDataService.delete', () => {
  it('returns true when a row was deleted', async () => {
    const service = makeService();
    queryMock
      .mockResolvedValueOnce(queryResult([{ id: 'task-1' }], 1))
      .mockResolvedValueOnce(queryResult([], 1));
    expect(await service.delete('Task', 'task-1')).toBe(true);
    expect(queryMock.mock.calls[1][0]).toContain('DELETE FROM "tasks"');
  });

  it('returns false on a miss, and deletes nothing', async () => {
    const service = makeService();
    queryMock.mockResolvedValue(queryResult([], 0));
    expect(await service.delete('Task', 'missing')).toBe(false);
    expect(queryMock).toHaveBeenCalledTimes(1);
  });
});

describe('PostgresDataService.getById / list / query', () => {
  it('getById returns null on miss and the row otherwise', async () => {
    const service = makeService();
    queryMock.mockResolvedValueOnce(queryResult([], 0));
    expect(await service.getById<Task>('Task', 'x')).toBeNull();
    queryMock.mockResolvedValueOnce(
      queryResult([{ id: 'x', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' }]),
    );
    const row = await service.getById<Task>('Task', 'x');
    expect(row?.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('query pushes supported filters into SQL and deserializes rows', async () => {
    const service = makeService();
    queryMock.mockResolvedValue(queryResult([{ id: 'a' }, { id: 'b' }]));
    const rows = await service.query<Task>('Task', [
      { field: 'title', op: 'contains', value: 'foo' },
      { field: 'done', op: '==', value: true },
      { field: 'tags', op: 'in', value: ['x', 'y'] },
    ]);
    expect(rows).toHaveLength(2);
    const [sql, params] = queryMock.mock.calls[0];
    expect(sql).toBe(`SELECT * FROM "tasks" WHERE "title"::text ILIKE '%' || $1 || '%' AND "done" = $2 AND "tags" = ANY($3)`);
    expect(params).toEqual(['foo', true, ['x', 'y']]);
  });

  it('getStore returns a StoreContract that throws on update of a missing row', async () => {
    const service = makeService();
    queryMock.mockResolvedValue(queryResult([], 0));
    const store = service.getStore<Task>('Task');
    await expect(store.update('missing', { title: 'X' })).rejects.toThrow('Entity missing not found in Task');
  });
});

describe('PostgresDataService.listPaginated', () => {
  it('returns the PaginatedResult shape with total from a count query', async () => {
    const service = makeService();
    queryMock
      .mockResolvedValueOnce(queryResult([{ id: 'a' }, { id: 'b' }]))
      .mockResolvedValueOnce(queryResult([{ total: 7 }]));
    const result = await service.listPaginated<Task>('Task', {
      page: 2,
      pageSize: 2,
      sortBy: 'title',
      sortOrder: 'desc',
    });
    expect(result).toEqual({ data: [{ id: 'a' }, { id: 'b' }], total: 7, page: 2, pageSize: 2, totalPages: 4 });
    const [pageSql] = queryMock.mock.calls[0];
    const [countSql, countParams] = queryMock.mock.calls[1];
    expect(pageSql).toContain('ORDER BY "title" DESC NULLS LAST LIMIT $1 OFFSET $2');
    expect(countSql).toBe('SELECT COUNT(*)::int AS total FROM "tasks"');
    expect(countParams).toEqual([]);
  });
});
