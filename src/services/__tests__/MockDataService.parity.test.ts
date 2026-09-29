/**
 * One mock store for both execution paths. A compiled app seeds through `MockDataService`
 * (collection-keyed, synchronous, called by generated `seedMockData.ts`); the runtime seeds the
 * same entities through `MockPersistenceAdapter`. They used to be two stores with two PRNGs
 * (faker vs the runtime's seeded one) and two id schemes (`mock-people-1` vs `Person Id 1`), so
 * the same program showed different mock data on each path.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EntityField, EntityRow } from '@almadar/core';
import { MockPersistenceAdapter } from '@almadar/runtime/mockPersistence';
import { MockDataService } from '../MockDataService.js';

interface Ticket { id: string; createdAt: Date; updatedAt: Date; title: string }

const PERSON: Array<EntityField & { name: string }> = [
  { name: 'id', type: 'string', required: true },
  { name: 'name', type: 'string', required: true },
  { name: 'role', type: 'string', required: true, values: ['supervisor', 'agent'] },
];
const TICKET: Array<EntityField & { name: string }> = [
  { name: 'id', type: 'string', required: true },
  { name: 'title', type: 'string', required: true },
  { name: 'points', type: 'number', required: false },
  { name: 'assignee', type: 'relation', required: false, relation: { entity: 'Person', cardinality: 'one' } },
];

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-06-01T00:00:00.000Z'));
});
afterEach(() => { vi.useRealTimers(); });

function compiledPath(): MockDataService {
  const service = new MockDataService();
  service.registerSchema('people', { name: 'Person', fields: PERSON });
  service.registerSchema('tickets', { name: 'Ticket', fields: TICKET });
  service.seed('people', PERSON, 4);
  service.seed('tickets', TICKET, 5);
  return service;
}

async function runtimePath(): Promise<{ people: EntityRow[]; tickets: EntityRow[] }> {
  const adapter = new MockPersistenceAdapter();
  adapter.registerEntity({ name: 'Person', collection: 'people', fields: PERSON }, 4);
  adapter.registerEntity({ name: 'Ticket', collection: 'tickets', fields: TICKET }, 5);
  return { people: await adapter.list('Person'), tickets: await adapter.list('Ticket') };
}

describe('MockDataService and the runtime mock are one store', () => {
  it('seed the same rows: ids, values, relation ids and timestamps', async () => {
    const runtime = await runtimePath();
    const compiled = compiledPath();
    expect(compiled.list<EntityRow>('people')).toEqual(runtime.people);
    expect(compiled.list<EntityRow>('tickets')).toEqual(runtime.tickets);
    expect(compiled.list<EntityRow>('people').map((r) => r.id)).toEqual(['Person Id 1', 'Person Id 2', 'Person Id 3', 'Person Id 4']);
  });

  it('control: a row created afterwards takes the next id of the entity\'s family on both paths', async () => {
    const adapter = new MockPersistenceAdapter();
    adapter.registerEntity({ name: 'Ticket', collection: 'tickets', fields: TICKET }, 5);
    const compiled = compiledPath();
    expect(compiled.create<Ticket>('tickets', { title: 'new' }).id).toBe((await adapter.create('Ticket', { title: 'new' })).id);
  });

  it('edge: collection and entity name reach the same store', () => {
    const compiled = compiledPath();
    expect(compiled.list<EntityRow>('Ticket')).toEqual(compiled.list<EntityRow>('tickets'));
    expect(compiled.count('tickets')).toBe(5);
  });
});
