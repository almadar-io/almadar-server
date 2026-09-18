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
  createdAt: Date;
  updatedAt: Date;
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
  it('honors a supplied non-empty string id and returns the full row with timestamps', async () => {
    const service = makeService();
    queryMock.mockResolvedValue(
      queryResult([{ id: 'task-1', title: 'T', createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01') }]),
    );
    const row = await service.create<Task>('Task', { id: 'task-1', title: 'T' });
    expect(row.id).toBe('task-1');
    expect(row.createdAt).toBeInstanceOf(Date);
    expect(row.updatedAt).toBeInstanceOf(Date);
    const [sql, params] = queryMock.mock.calls[0];
    expect(sql).toContain('INSERT INTO "tasks"');
    expect(sql).toContain('RETURNING *');
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
    queryMock.mockResolvedValue(queryResult([{ id: 'minted' }]));
    await service.create<Task>('Task', { title: 'No id' });
    const params = queryMock.mock.calls[0][1];
    expect(params).toHaveLength(4); // title, id, createdAt, updatedAt
    expect(params[1]).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('PostgresDataService.update', () => {
  it('returns null when no row matches', async () => {
    const service = makeService();
    queryMock.mockResolvedValue(queryResult([], 0));
    const result = await service.update<Task>('Task', 'missing', { title: 'X' });
    expect(result).toBeNull();
  });

  it('issues UPDATE ... WHERE id RETURNING * and refreshes updatedAt', async () => {
    const service = makeService();
    queryMock.mockResolvedValue(
      queryResult([{ id: 'task-1', title: 'New', createdAt: new Date(), updatedAt: new Date() }]),
    );
    const result = await service.update<Task>('Task', 'task-1', { title: 'New' });
    expect(result?.id).toBe('task-1');
    const [sql, params] = queryMock.mock.calls[0];
    expect(sql).toContain('UPDATE "tasks" SET');
    expect(sql).toContain('WHERE "id" = $');
    expect(sql).toContain('RETURNING *');
    expect(params?.[params.length - 1]).toBe('task-1');
  });
});

describe('PostgresDataService.delete', () => {
  it('returns true when a row was deleted', async () => {
    const service = makeService();
    queryMock.mockResolvedValue(queryResult([], 1));
    expect(await service.delete('Task', 'task-1')).toBe(true);
  });

  it('returns false on a miss', async () => {
    const service = makeService();
    queryMock.mockResolvedValue(queryResult([], 0));
    expect(await service.delete('Task', 'missing')).toBe(false);
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
    expect(row?.createdAt).toBeInstanceOf(Date);
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
