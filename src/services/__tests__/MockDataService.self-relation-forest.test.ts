/**
 * The compiled path's twin of the interpreted runtime's self-relation forest
 * (packages/almadar-runtime/test/mock-persistence-self-relation-many-forest.test.ts).
 * `MockDataService.generateFieldValue` used to hand every relation field —
 * self or cross-entity, any cardinality — one RANDOM id with no forest at
 * all, so a `ChatMessage.replies : [ChatMessage]` self-relation (as in
 * std-realtime-chat) referenced siblings arbitrarily and nothing was ever
 * deletable under a default `onDelete: restrict` policy. See
 * docs/Almadar_Runtime_Gaps.md R-MOCK-SELF-RELATION-MANY-RANDOM-LINKING.
 */
import { describe, expect, it } from 'vitest';
import { MockDataService } from '../MockDataService.js';
import type { EntityRow } from '@almadar/core';

const CHAT_MESSAGE_FIELDS = [
  { name: 'id', type: 'string' as const, required: true },
  { name: 'text', type: 'string' as const, required: true },
  {
    name: 'replies',
    type: 'relation' as const,
    required: false,
    relation: { entity: 'ChatMessage', cardinality: 'many' as const },
  },
];

function seededChat(): MockDataService {
  const service = new MockDataService();
  service.registerSchema('chatmessage', { name: 'ChatMessage', fields: CHAT_MESSAGE_FIELDS });
  service.seed('chatmessage', CHAT_MESSAGE_FIELDS, 6);
  return service;
}

describe('self-relation many forest (ChatMessage.replies) via MockDataService', () => {
  it('seeds exactly the requested row count', () => {
    const rows = seededChat().list<EntityRow>('chatmessage');
    expect(rows).toHaveLength(6);
  });

  it("row 0 (root) is never listed in any row's replies", () => {
    const rows = seededChat().list<EntityRow>('chatmessage');
    const rootId = rows[0]!.id as string;
    for (const row of rows) {
      expect(row.replies as string[]).not.toContain(rootId);
    }
  });

  it('no row lists itself as a reply', () => {
    const rows = seededChat().list<EntityRow>('chatmessage');
    for (const row of rows) {
      expect(row.replies as string[]).not.toContain(row.id);
    }
  });

  it('every listed child has exactly one parent', () => {
    const rows = seededChat().list<EntityRow>('chatmessage');
    const parentCountByChild = new Map<string, number>();
    for (const row of rows) {
      for (const childId of row.replies as string[]) {
        parentCountByChild.set(childId, (parentCountByChild.get(childId) ?? 0) + 1);
      }
    }
    for (const count of parentCountByChild.values()) {
      expect(count).toBe(1);
    }
    const rootId = rows[0]!.id as string;
    for (const row of rows) {
      if (row.id === rootId) continue;
      expect(parentCountByChild.get(row.id as string)).toBe(1);
    }
  });
});
