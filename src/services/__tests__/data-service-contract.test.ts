/**
 * `DataService` (public API; the compiled apps' data path) is one facade over a
 * `PersistenceAdapter`, the same storage the runtime path uses. These cases pin the semantics the
 * per-backend DataService classes had, and run over an adapter without pushdown (in-memory
 * fallbacks) and one with native `query`/`listPage`, so the facade behaves the same over both.
 */
import { describe, it, expect } from 'vitest';
import { InMemoryPersistence, type PersistenceAdapter } from '@almadar/runtime';
import type { EntityRow, RowPage, RowPageRequest, StoreFilter } from '@almadar/core';
import { dataServiceOver } from '../data/data-service-over.js';
import { filterRows, pageRows } from '../data/row-query.js';
import { MockDataPersistence, MockDataService } from '../MockDataService.js';

interface Task { id: string; createdAt: Date; updatedAt: Date; title?: string; points?: number }

class PushdownMemory extends InMemoryPersistence {
  queries = 0;
  pages = 0;
  async query(entityType: string, filters: readonly StoreFilter<EntityRow>[]): Promise<EntityRow[]> {
    this.queries++;
    return filterRows(await this.list(entityType), filters);
  }
  async listPage(entityType: string, request: RowPageRequest<EntityRow>): Promise<RowPage<EntityRow>> {
    this.pages++;
    return pageRows(await this.list(entityType), request);
  }
}

const adapters: Array<[string, () => PersistenceAdapter]> = [
  ['an adapter without pushdown', () => new InMemoryPersistence()],
  ['an adapter with native query and paging', () => new PushdownMemory()],
  ['the mock data service', () => { const mock = new MockDataService(); return new MockDataPersistence(() => mock); }],
];

describe.each(adapters)('dataServiceOver %s', (_label, make) => {
  it('create returns the entity with its id and both timestamps, and keeps a supplied id', async () => {
    const ds = dataServiceOver(make());
    const made = await ds.create<Task>('Task', { title: 't' });
    expect(made).toMatchObject({ title: 't' });
    expect(typeof made.id).toBe('string');
    expect(made.createdAt).toBeInstanceOf(Date);
    expect(made.updatedAt).toEqual(made.createdAt);
    expect(await ds.getById<Task>('Task', made.id)).toEqual(made);
    expect((await ds.create<Task>('Task', { id: 'fixed', title: 'u' })).id).toBe('fixed');
  });

  it('update merges, bumps updatedAt, keeps id and createdAt', async () => {
    const ds = dataServiceOver(make());
    const made = await ds.create<Task>('Task', { title: 'a', points: 1 });
    await new Promise((r) => setTimeout(r, 5));
    const next = await ds.update<Task>('Task', made.id, { points: 2, id: 'ignored', createdAt: new Date(0) });
    expect(next).toMatchObject({ id: made.id, title: 'a', points: 2 });
    expect(next?.createdAt).toEqual(made.createdAt);
    expect(next && next.updatedAt.getTime()).toBeGreaterThan(made.updatedAt.getTime());
    expect(await ds.getById<Task>('Task', made.id)).toEqual(next);
  });

  it('control: update of a missing row returns null and creates nothing', async () => {
    const ds = dataServiceOver(make());
    expect(await ds.update<Task>('Task', 'nope', { title: 'x' })).toBeNull();
    expect(await ds.list('Task')).toEqual([]);
  });

  it('edge: update with nothing to change returns the row unchanged', async () => {
    const ds = dataServiceOver(make());
    const made = await ds.create<Task>('Task', { title: 'a' });
    expect(await ds.update<Task>('Task', made.id, {})).toMatchObject({ id: made.id, title: 'a' });
  });

  it('delete reports whether a row existed', async () => {
    const ds = dataServiceOver(make());
    const made = await ds.create<Task>('Task', { title: 'a' });
    expect(await ds.delete('Task', made.id)).toBe(true);
    expect(await ds.delete('Task', made.id)).toBe(false);
  });

  it('query keeps the rows matching every filter', async () => {
    const ds = dataServiceOver(make());
    await ds.create<Task>('Task', { id: '1', points: 1 });
    await ds.create<Task>('Task', { id: '2', points: 5 });
    await ds.create<Task>('Task', { id: '3', points: 9 });
    const hits = await ds.query<Task>('Task', [{ field: 'points', op: '>', value: 2 }, { field: 'points', op: '<', value: 9 }]);
    expect(hits.map((t) => t.id)).toEqual(['2']);
  });

  it('listPaginated filters, searches, sorts and pages, with page defaults 1 and 20', async () => {
    const ds = dataServiceOver(make());
    for (let i = 1; i <= 25; i++) await ds.create<Task>('Task', { id: `t${i}`, title: i % 2 ? 'odd task' : 'even task', points: i });
    const page = await ds.listPaginated<Task>('Task', { search: 'odd', sortBy: 'points', sortOrder: 'desc', pageSize: 5, page: 2, filters: [{ field: 'points', operator: '>', value: 2 }] });
    expect(page.total).toBe(12);
    expect(page.totalPages).toBe(3);
    expect(page.data.map((t) => t.points)).toEqual([15, 13, 11, 9, 7]);
    const first = await ds.listPaginated<Task>('Task');
    expect([first.page, first.pageSize, first.data.length, first.total]).toEqual([1, 20, 20, 25]);
  });

  it('getStore binds the collection; its update throws on a missing row', async () => {
    const ds = dataServiceOver(make());
    const store = ds.getStore<Task>('Task');
    const made = await store.create({ title: 's', createdAt: new Date(), updatedAt: new Date() });
    expect(await store.getById(made.id)).toMatchObject({ title: 's' });
    await expect(store.update('missing', { title: 'x' })).rejects.toThrow(/not found/);
    await store.delete(made.id);
    expect(await store.getById(made.id)).toBeNull();
  });
});

it('uses the adapter\'s native query and paging when it has them', async () => {
  const adapter = new PushdownMemory();
  const ds = dataServiceOver(adapter);
  await ds.query('Task', [{ field: 'points', op: '==', value: 1 }]);
  await ds.listPaginated('Task', { page: 1, pageSize: 5 });
  expect([adapter.queries, adapter.pages]).toEqual([1, 1]);
});
