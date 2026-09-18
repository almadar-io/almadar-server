/**
 * Integration tests against a real PostgreSQL — skipped unless
 * TEST_DATABASE_URL is set (e.g. TEST_DATABASE_URL=postgres://localhost:5432/test).
 */
import { describe, it, expect, afterAll } from 'vitest';
import { Pool } from 'pg';
import type { Entity } from '@almadar/core';
import { ensureSchema, generateSchemaDdl } from '../postgres/schema/ddl.js';
import { PostgresDataService } from '../postgres/postgres-data-service.js';
import { PostgresPersistence } from '../postgres/postgres-persistence.js';

const connectionString = process.env.TEST_DATABASE_URL;

interface TimeEntryRow {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  note?: string;
  minutes?: number;
  done?: boolean;
  meta?: Record<string, unknown>;
  workedOn?: string;
  ownerId?: string;
}

describe.skipIf(!connectionString)('postgres integration (TEST_DATABASE_URL)', () => {
  const pool = new Pool({ connectionString });
  const entities: Entity[] = [
    { name: 'User', fields: [{ name: 'name', type: 'string' }] },
    {
      name: 'TimeEntry',
      fields: [
        { name: 'note', type: 'string' },
        { name: 'minutes', type: 'number' },
        { name: 'done', type: 'boolean' },
        { name: 'meta', type: 'object' },
        { name: 'workedOn', type: 'date' },
        { name: 'ownerId', type: 'relation', relation: { entity: 'User', cardinality: 'one', onDelete: 'cascade' } },
      ],
    },
    { name: 'Post', fields: [{ name: 'title', type: 'string' }, { name: 'tags', type: 'relation', relation: { entity: 'Tag', cardinality: 'many-to-many' } }] },
    { name: 'Tag', fields: [{ name: 'label', type: 'string' }] },
  ];

  afterAll(async () => {
    if (!connectionString) return;
    await pool.query('DROP TABLE IF EXISTS time_entries, users, posts_tags, posts, tags CASCADE');
    await pool.end();
  });

  it('applies DDL including a junction table, idempotently', async () => {
    await ensureSchema(pool, entities);
    await ensureSchema(pool, entities);
    const junction = generateSchemaDdl(entities).find((d) => d.includes('"posts_tags"'));
    expect(junction).toBeDefined();
    const found = await pool.query("SELECT to_regclass('posts_tags') AS name");
    expect(found.rows[0].name).toBe('posts_tags');
  });

  it('CRUD round-trip via PostgresDataService with timestamp deserialization', async () => {
    const service = new PostgresDataService({ pool });
    const created = await service.create<TimeEntryRow>('TimeEntry', { note: 'round-trip', minutes: 30, done: false });
    expect(created.id).toBeTruthy();
    expect(created.createdAt).toBeInstanceOf(Date);

    const fetched = await service.getById<TimeEntryRow>('TimeEntry', created.id);
    expect(fetched?.note).toBe('round-trip');

    const updated = await service.update<TimeEntryRow>('TimeEntry', created.id, { minutes: 45 });
    expect(updated?.minutes).toBe(45);
    expect(updated?.updatedAt.getTime()).toBeGreaterThanOrEqual(created.updatedAt.getTime());

    expect(await service.delete('TimeEntry', created.id)).toBe(true);
    expect(await service.delete('TimeEntry', created.id)).toBe(false);
    expect(await service.update<TimeEntryRow>('TimeEntry', created.id, { minutes: 1 })).toBeNull();
  });

  it('honors an explicit id and rejects duplicates via PostgresPersistence', async () => {
    const adapter = new PostgresPersistence({ pool });
    await adapter.create('User', { id: 'user-explicit-1', name: 'Ada' });
    expect((await adapter.getById('User', 'user-explicit-1'))?.name).toBe('Ada');
    await expect(adapter.create('User', { id: 'user-explicit-1' })).rejects.toThrow(
      'Entity User with id user-explicit-1 already exists',
    );
    await adapter.delete('User', 'user-explicit-1');
  });

  it('query operators push down to SQL', async () => {
    const service = new PostgresDataService({ pool });
    await service.create<TimeEntryRow>('TimeEntry', { note: 'alpha entry', minutes: 10, done: true });
    await service.create<TimeEntryRow>('TimeEntry', { note: 'beta entry', minutes: 20, done: false });
    await service.create<TimeEntryRow>('TimeEntry', { note: 'gamma', minutes: 30, done: false });

    const gt = await service.query<TimeEntryRow>('TimeEntry', [{ field: 'minutes', op: '>', value: 15 }]);
    expect(gt.map((r) => r.note).sort()).toEqual(['beta entry', 'gamma']);

    const contains = await service.query<TimeEntryRow>('TimeEntry', [{ field: 'note', op: 'contains', value: 'ENTRY' }]);
    expect(contains).toHaveLength(2);

    const inOp = await service.query<TimeEntryRow>('TimeEntry', [{ field: 'minutes', op: 'in', value: [10, 30] }]);
    expect(inOp).toHaveLength(2);

    const notIn = await service.query<TimeEntryRow>('TimeEntry', [{ field: 'note', op: 'not-in', value: ['gamma'] }]);
    expect(notIn).toHaveLength(2);

    const rows = await service.query<TimeEntryRow>('TimeEntry', []);
    await Promise.all(rows.map((r) => service.delete('TimeEntry', r.id)));
  });

  it('listPaginated returns the full result shape', async () => {
    const service = new PostgresDataService({ pool });
    for (let i = 1; i <= 5; i++) {
      await service.create<TimeEntryRow>('TimeEntry', { note: `page-${i}`, minutes: i, done: false });
    }
    const page1 = await service.listPaginated<TimeEntryRow>('TimeEntry', {
      page: 1,
      pageSize: 2,
      search: 'page-',
      searchFields: ['note'],
      sortBy: 'minutes',
      sortOrder: 'asc',
    });
    expect(page1.total).toBe(5);
    expect(page1.totalPages).toBe(3);
    expect(page1.data).toHaveLength(2);
    expect(page1.data[0].note).toBe('page-1');

    const remaining = await service.query<TimeEntryRow>('TimeEntry', [{ field: 'note', op: 'contains', value: 'page-' }]);
    await Promise.all(remaining.map((r) => service.delete('TimeEntry', r.id)));
  });
});
