/**
 * The compiled half of the seeded mock-dataset vector (canonical source: `@almadar-io/parity`
 * `fixtures/mock-seed/dataset.seeded.json`, mirrored here by the pattern-sync bake). This drives
 * `MockDataService` exactly as a generated `seedMockData.ts` does — one entry per entity, the
 * `[identity]` entity first, authored instances created, everything else seeded — and must produce
 * the rows the runtime and orbital-core produce.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isEntityCall, type Entity, type EntityRow, type OrbitalSchema } from '@almadar/core';
import { MockDataService, type FieldSchema } from '../MockDataService.js';

interface DatasetVector {
  schema: OrbitalSchema;
  nowMs: number;
  count: number;
  rows: Record<string, EntityRow[]>;
}

const vector: DatasetVector = JSON.parse(readFileSync(join(import.meta.dirname, 'baked', 'mock-seed', 'dataset.seeded.json'), 'utf8'));

function inline(ref: OrbitalSchema['orbitals'][number]['entity'] | undefined): Entity | undefined {
  if (ref === undefined || typeof ref === 'string' || isEntityCall(ref)) return undefined;
  return ref;
}

function namedFields(entity: Entity): FieldSchema[] {
  return entity.fields.filter((f): f is FieldSchema => typeof f.name === 'string');
}

/** The generated `seedMockData.ts` order: the `[identity]` entity, then every entity as declared. */
function generatedEntries(): Array<{ entity: Entity; primary: boolean }> {
  const all: Array<{ entity: Entity; primary: boolean }> = [];
  for (const orbital of vector.schema.orbitals) {
    const primary = inline(orbital.entity);
    if (primary) all.push({ entity: primary, primary: true });
    for (const aux of orbital.auxiliaryEntities ?? []) {
      const e = inline(aux);
      if (e) all.push({ entity: e, primary: false });
    }
  }
  return [...all.filter((e) => e.entity.identity), ...all.filter((e) => !e.entity.identity)];
}

function seedLikeGeneratedCode(): MockDataService {
  const service = new MockDataService();
  for (const { entity } of generatedEntries()) {
    const collection = entity.collection ?? entity.name.toLowerCase();
    service.registerSchema(collection, {
      name: entity.name,
      fields: namedFields(entity),
      ...(entity.identity ? { identity: true } : {}),
      ...(entity.create_policy !== undefined ? { createPolicy: entity.create_policy } : {}),
    });
    if (entity.instances && entity.instances.length > 0) {
      for (const item of entity.instances) service.create(entity.name, item);
    } else {
      service.seed(entity.name, namedFields(entity), vector.count, entity.persistence);
    }
  }
  return service;
}

afterEach(() => { vi.useRealTimers(); });

describe('compiled mock store matches the seeded dataset vector', () => {
  it('reproduces the committed store', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(vector.nowMs);
    const service = seedLikeGeneratedCode();
    for (const [entity, rows] of Object.entries(vector.rows)) {
      expect(service.list<EntityRow>(entity)).toEqual(rows);
    }
  });

  it('control: another ALMADAR_PERSONA changes the owner stamps', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(vector.nowMs);
    process.env['ALMADAR_PERSONA'] = 'Person Id 5';
    try {
      const service = seedLikeGeneratedCode();
      expect(service.list<EntityRow>('Tag')).toEqual(vector.rows['Tag']);
      expect(service.list<EntityRow>('Ticket')).not.toEqual(vector.rows['Ticket']);
    } finally {
      delete process.env['ALMADAR_PERSONA'];
    }
  });
});
