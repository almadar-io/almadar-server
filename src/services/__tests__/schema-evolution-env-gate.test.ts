import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Entity } from '@almadar/core';
import type { SqlExecutor } from '@almadar/db';

const V1: Entity[] = [{ name: 'Task', fields: [{ name: 'title', type: 'string' }, { name: 'status', type: 'string' }] }];
const DROPPED: Entity[] = [{ name: 'Task', fields: [{ name: 'title', type: 'string' }] }];

function column(name: string, type = 'text') {
  return { table_name: 'tasks', column_name: name, data_type: type, numeric_precision: null, numeric_scale: null };
}

function executorHoldingV1(): SqlExecutor {
  return {
    async query(sql: string, params?: unknown[]) {
      const names = (params?.[1] ?? []) as string[];
      if (sql.includes('information_schema.tables')) return { rows: [{ table_name: 'tasks' }] };
      if (sql.includes('information_schema.columns')) {
        const cols = [column('id'), column('title'), column('status'), column('created_at', 'timestamp with time zone'), column('updated_at', 'timestamp with time zone')];
        return { rows: cols.filter((c) => names.includes(c.table_name)) };
      }
      return { rows: [] };
    },
  };
}

describe('applySchemaEvolution reads the server env into the db gate', () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('refuses a destructive change in production without PG_MIGRATE_DESTRUCTIVE=apply', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('PG_MIGRATE_DESTRUCTIVE', 'refuse');
    const { applySchemaEvolution } = await import('../postgres/schema-evolution.js');
    await expect(applySchemaEvolution(executorHoldingV1(), DROPPED, { destructive: true })).rejects.toThrow(
      /destructive schema evolution refused in production/,
    );
  });

  it('control: applies the same change when the operator opted in with PG_MIGRATE_DESTRUCTIVE=apply', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('PG_MIGRATE_DESTRUCTIVE', 'apply');
    const { applySchemaEvolution } = await import('../postgres/schema-evolution.js');
    const report = await applySchemaEvolution(executorHoldingV1(), DROPPED, { destructive: true });
    expect(report.refused).toEqual([]);
    expect(report.applied.some((s) => s.includes('DROP COLUMN'))).toBe(true);
  });

  it('control: outside production the same change is refused softly, not thrown', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('PG_MIGRATE_DESTRUCTIVE', 'refuse');
    const { applySchemaEvolution } = await import('../postgres/schema-evolution.js');
    const report = await applySchemaEvolution(executorHoldingV1(), DROPPED, { destructive: true });
    expect(report.applied).toEqual([]);
    expect(report.refused).toHaveLength(1);
  });

  it('keeps V1 untouched when nothing differs', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const { applySchemaEvolution } = await import('../postgres/schema-evolution.js');
    const report = await applySchemaEvolution(executorHoldingV1(), V1, {});
    expect(report).toEqual({ applied: [], refused: [] });
  });
});
