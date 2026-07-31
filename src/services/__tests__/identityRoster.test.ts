/**
 * The compiled path's persona roster — live `[identity]` rows, not a re-derivation.
 *
 * Three seeders mint three different id schemes for the same entity (`Person-N`
 * in the Rust roster, `mock-people-N` here, `Person Id N` on the interpreter
 * path). A viewer whose id is not literally one of these rows owns nothing, so
 * every ownership-scoped list renders empty — indistinguishable from a working
 * filter over no data. These tests pin that the roster and the resolved viewer
 * both come from the rows that actually exist.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MockDataService } from '../MockDataService.js';

const PERSON_FIELDS = [
  { name: 'id', type: 'string' as const, required: true },
  { name: 'name', type: 'string' as const, required: true },
  {
    name: 'role',
    type: 'string' as const,
    required: true,
    values: ['supervisor', 'agent', 'customer'],
  },
];

const TICKET_FIELDS = [
  { name: 'id', type: 'string' as const, required: true },
  {
    name: 'assignee',
    type: 'relation' as const,
    required: false,
    relation: { entity: 'Person', cardinality: 'one' as const },
  },
];

/** `entity Person [persistent: people, identity]` + a Ticket that references it. */
function seededApp(): MockDataService {
  const service = new MockDataService();
  service.registerSchema('people', { name: 'Person', identity: true, fields: PERSON_FIELDS });
  service.registerSchema('tickets', { name: 'Ticket', fields: TICKET_FIELDS });
  service.seed('people', PERSON_FIELDS, 6);
  service.seed('tickets', TICKET_FIELDS, 4);
  return service;
}

describe('identity collection', () => {
  it('is named by the declared flag, never inferred from a collection name', () => {
    expect(seededApp().getIdentityCollection()).toBe('people');
  });

  it('is undefined when the app declares no [identity] entity', () => {
    const service = new MockDataService();
    service.registerSchema('tickets', { name: 'Ticket', fields: TICKET_FIELDS });
    expect(service.getIdentityCollection()).toBeUndefined();
    expect(service.getIdentityRoster()).toEqual([]);
  });
});

describe('getIdentityRoster', () => {
  it('returns the live seeded rows, so every persona id exists in the store', () => {
    const service = seededApp();
    const roster = service.getIdentityRoster();
    const storedIds = service.list<{ id: string }>('people').map((row) => row.id);

    expect(roster.length).toBe(6);
    expect(roster.map((p) => p.id).sort()).toEqual(storedIds.sort());
  });

  it('covers every declared role, so each persona sees a different slice', () => {
    const roles = new Set(seededApp().getIdentityRoster().map((p) => p.role));
    expect(roles).toEqual(new Set(['supervisor', 'agent', 'customer']));
  });
});

describe('relation columns resolve entity name to collection', () => {
  it('fills an entity-typed reference with a real identity row id', () => {
    const service = seededApp();
    const personIds = new Set(service.list<{ id: string }>('people').map((row) => row.id));
    const assignees = service
      .list<{ assignee?: string | null }>('tickets')
      .map((row) => row.assignee);

    expect(assignees.length).toBe(4);
    for (const assignee of assignees) {
      // `assignee : Person` must resolve through the `people` store. Before the
      // name→collection mapping this looked up `person`, missed, and seeded null.
      expect(assignee).not.toBeNull();
      expect(personIds.has(String(assignee))).toBe(true);
    }
  });
});

describe('ALMADAR_PERSONA resolves against the roster', () => {
  const original = process.env['ALMADAR_PERSONA'];
  const originalOwns = process.env['ALMADAR_PERSONA_OWNS'];

  beforeEach(() => {
    process.env['ALMADAR_PERSONA_OWNS'] = 'Ticket.assignee';
  });

  afterEach(() => {
    if (original === undefined) delete process.env['ALMADAR_PERSONA'];
    else process.env['ALMADAR_PERSONA'] = original;
    if (originalOwns === undefined) delete process.env['ALMADAR_PERSONA_OWNS'];
    else process.env['ALMADAR_PERSONA_OWNS'] = originalOwns;
  });

  it('stamps a bare role onto the declared owner column', () => {
    const service = new MockDataService();
    service.registerSchema('people', { name: 'Person', identity: true, fields: PERSON_FIELDS });
    service.registerSchema('tickets', { name: 'Ticket', fields: TICKET_FIELDS });
    // Identity seeded FIRST — this is the ordering codegen emits.
    service.seed('people', PERSON_FIELDS, 6);

    const agent = service.getIdentityRoster().find((p) => p.role === 'agent');
    expect(agent).toBeDefined();
    process.env['ALMADAR_PERSONA'] = 'agent';

    service.seed('tickets', TICKET_FIELDS, 4);
    const owned = service
      .list<{ assignee?: string | null }>('tickets')
      .filter((row) => row.assignee === agent?.id);

    // A bare role used to throw against the hardcoded empty roster, leaving
    // every row unowned; the viewer now owns every other row.
    expect(owned.length).toBeGreaterThan(0);
  });
});
