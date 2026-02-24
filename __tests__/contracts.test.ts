import { describe, it, expect } from 'vitest';
import type { DataServiceContract, EventBusServiceContract, ServerEventMap } from '../src/contracts';
import type { ServiceEvents, StoreContract, StoreFilter } from '@almadar/core';

describe('DataServiceContract', () => {
  it('can be implemented with correct action signatures', async () => {
    const mock: DataServiceContract = {
      async execute(action, params) {
        if (action === 'list') {
          return { items: [{ id: '1', name: 'test' }] };
        }
        if (action === 'create') {
          return { item: { id: '2', ...params.data } };
        }
        if (action === 'getById') {
          return { item: null };
        }
        if (action === 'update') {
          return { item: null };
        }
        if (action === 'delete') {
          return { deleted: true };
        }
        throw new Error(`Unknown action: ${action}`);
      },
    };

    const listResult = await mock.execute('list', { collection: 'users' });
    expect(listResult.items).toHaveLength(1);

    const createResult = await mock.execute('create', {
      collection: 'users',
      data: { name: 'Alice' },
    });
    expect(createResult.item).toBeTruthy();
  });
});

describe('EventBusServiceContract', () => {
  it('can be implemented with correct action signatures', async () => {
    const mock: EventBusServiceContract = {
      async execute(action, params) {
        if (action === 'emit') {
          return { delivered: 3 };
        }
        if (action === 'getListenerCounts') {
          return { counts: { USER_CREATED: 2 } };
        }
        throw new Error(`Unknown action: ${action}`);
      },
    };

    const result = await mock.execute('emit', { event: 'USER_CREATED', payload: { id: '1' } });
    expect(result.delivered).toBe(3);
  });
});

describe('ServerEventMap', () => {
  it('provides typed emit/on via ServiceEvents', () => {
    const handlers: Array<(payload: unknown) => void> = [];
    const mockBus: ServiceEvents<ServerEventMap> = {
      emit(_event, _payload) { /* no-op */ },
      on(_event, handler) {
        handlers.push(handler as (payload: unknown) => void);
        return () => { /* unsubscribe */ };
      },
    };

    // Type-safe: payload must match ServerEventMap['SERVICE_REGISTERED']
    mockBus.emit('SERVICE_REGISTERED', {
      name: 'llm', instanceId: 'i-1', host: 'localhost', port: 3000,
    });

    const unsub = mockBus.on('SERVICE_DEREGISTERED', (payload) => {
      expect(payload.name).toBe('llm');
      expect(payload.reason).toBe('expired');
    });

    expect(typeof unsub).toBe('function');
    expect(handlers).toHaveLength(1);
  });
});

describe('StoreContract', () => {
  it('can be implemented for a typed entity', async () => {
    interface User { id: string; name: string; email: string }
    const data = new Map<string, User>();

    const store: StoreContract<User> = {
      async getById(id) {
        return data.get(id) ?? null;
      },
      async create(input) {
        const user = { ...input, id: `u-${data.size + 1}` } as User;
        data.set(user.id, user);
        return user;
      },
      async update(id, partial) {
        const existing = data.get(id);
        if (!existing) throw new Error('Not found');
        const updated = { ...existing, ...partial };
        data.set(id, updated);
        return updated;
      },
      async delete(id) {
        data.delete(id);
      },
      async query(filters) {
        return Array.from(data.values()).filter((user) =>
          filters.every((f) => {
            const val = user[f.field];
            return f.op === '==' ? val === f.value : true;
          }),
        );
      },
    };

    const created = await store.create({ name: 'Alice', email: 'alice@test.com' });
    expect(created.id).toBe('u-1');
    expect(created.name).toBe('Alice');

    const found = await store.getById('u-1');
    expect(found?.email).toBe('alice@test.com');

    const updated = await store.update('u-1', { name: 'Bob' });
    expect(updated.name).toBe('Bob');

    const results = await store.query([{ field: 'name', op: '==', value: 'Bob' }]);
    expect(results).toHaveLength(1);

    await store.delete('u-1');
    expect(await store.getById('u-1')).toBeNull();
  });
});
