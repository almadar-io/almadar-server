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
import { PostgresPersistence } from '../postgres/postgres-persistence.js';

let pool: Pool;
let queryMock: Mock;

beforeEach(() => {
  vi.clearAllMocks();
  queryMocks.length = 0;
  pool = new Pool();
  queryMock = queryMocks[0];
});

function makeAdapter(): PostgresPersistence {
  return new PostgresPersistence({ pool });
}

function queryResult(rows: object[], rowCount = rows.length) {
  return { rows, rowCount, command: '', oid: 0, fields: [] };
}

describe('PostgresPersistence.create', () => {
  it('honors a supplied non-empty string id (R-MOCK-STORE-REKEYS-EXPLICIT-CREATE-ID parity)', async () => {
    const adapter = makeAdapter();
    queryMock.mockResolvedValue(queryResult([], 1));
    const result = await adapter.create('Task', { id: 'task-explicit-1', title: 'Explicit' });
    expect(result.id).toBe('task-explicit-1');
    const [sql, params] = queryMock.mock.calls[0];
    expect(sql).toContain('INSERT INTO "tasks"');
    expect(params).toContain('task-explicit-1');
  });

  it('throws on duplicate id', async () => {
    const adapter = makeAdapter();
    const err = new DatabaseError('duplicate key', 0, 'error');
    err.code = '23505';
    queryMock.mockRejectedValue(err);
    await expect(adapter.create('Task', { id: 'dupe' })).rejects.toThrow('Entity Task with id dupe already exists');
  });

  it('mints a uuid when id is absent or empty', async () => {
    const adapter = makeAdapter();
    queryMock.mockResolvedValue(queryResult([], 1));
    const result = await adapter.create('Task', { title: 'No id' });
    expect(result.id).toMatch(/^[0-9a-f-]{36}$/);
    const [, params] = queryMock.mock.calls[0];
    expect(params).toContain(result.id);
  });
});

describe('PostgresPersistence.update / delete', () => {
  it('update issues a parameterized UPDATE scoped by id', async () => {
    const adapter = makeAdapter();
    queryMock.mockResolvedValue(queryResult([], 1));
    await adapter.update('Task', 'task-1', { title: 'New' });
    const [sql, params] = queryMock.mock.calls[0];
    expect(sql).toBe('UPDATE "tasks" SET "title" = $1 WHERE "id" = $2');
    expect(params).toEqual(['New', 'task-1']);
  });

  it('delete issues a parameterized DELETE scoped by id', async () => {
    const adapter = makeAdapter();
    queryMock.mockResolvedValue(queryResult([], 0));
    await adapter.delete('Task', 'missing');
    const [sql, params] = queryMock.mock.calls[0];
    expect(sql).toBe('DELETE FROM "tasks" WHERE "id" = $1');
    expect(params).toEqual(['missing']);
  });
});

describe('PostgresPersistence.getById / list', () => {
  it('getById returns null on miss, deserializes timestamps on hit', async () => {
    const adapter = makeAdapter();
    queryMock.mockResolvedValueOnce(queryResult([], 0));
    expect(await adapter.getById('Task', 'x')).toBeNull();
    queryMock.mockResolvedValueOnce(
      queryResult([{ id: 'x', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' }]),
    );
    const row = await adapter.getById('Task', 'x');
    expect(row?.createdAt).toBeInstanceOf(Date);
  });

  it('list returns all rows of the entity table', async () => {
    const adapter = makeAdapter();
    queryMock.mockResolvedValue(queryResult([{ id: 'a' }, { id: 'b' }]));
    const rows = await adapter.list('Task');
    expect(rows).toHaveLength(2);
    const [sql] = queryMock.mock.calls[0];
    expect(sql).toBe('SELECT * FROM "tasks"');
  });
});
