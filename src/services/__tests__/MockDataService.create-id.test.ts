/**
 * C1-V13: `MockDataService.create` must honor a caller-supplied `id`
 * instead of always minting one — the compiled-app twin of the interpreted
 * runtime's `MockPersistenceAdapter` bug (see
 * packages/almadar-runtime/test/mock-persistence-create-id.test.ts).
 * Without this, a compiled app's `CREATE_TASK` create succeeds under the
 * payload id while the store actually keys the row under a different,
 * minted id, and a same-instance follow-up update 404s.
 */
import { describe, it, expect } from 'vitest';
import { MockDataService } from '../MockDataService.js';

interface Task {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  title: string;
}

describe('MockDataService.create — id contract', () => {
  it('keeps an explicit data.id and the row is retrievable via getById', () => {
    const service = new MockDataService();
    const row = service.create<Task>('Task', { id: 'task-explicit-1', title: 'Explicit' });
    expect(row.id).toBe('task-explicit-1');
    const fetched = service.getById<Task>('Task', 'task-explicit-1');
    expect(fetched).not.toBeNull();
    expect(fetched!.title).toBe('Explicit');
  });

  it('throws on a second create with the same explicit id (unique constraint)', () => {
    const service = new MockDataService();
    service.create<Task>('Task', { id: 'task-dupe', title: 'First' });
    expect(() => service.create<Task>('Task', { id: 'task-dupe', title: 'Second' })).toThrow(
      'Entity Task with id task-dupe already exists',
    );
  });

  it('mints an id when the caller supplies none', () => {
    const service = new MockDataService();
    const row = service.create<Task>('Task', { title: 'No id supplied' });
    expect(row.id).toBe('mock-task-1');
    const fetched = service.getById<Task>('Task', row.id);
    expect(fetched).not.toBeNull();
  });
});
