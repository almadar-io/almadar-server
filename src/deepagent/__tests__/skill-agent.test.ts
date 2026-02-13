/**
 * @fileoverview Unit tests for skill agent factory
 * @module @almadar/server/deepagent/skill-agent.test
 */

import { describe, it, expect, vi } from 'vitest';

// Mock the db module — skill-agent transitively imports it
vi.mock('../../lib/db.js', () => ({
  db: { collection: vi.fn() },
  getFirestore: vi.fn(() => ({ collection: vi.fn() })),
  getAuth: vi.fn(() => ({ verifyIdToken: vi.fn() })),
  admin: {},
}));

describe('createServerSkillAgent', () => {
  it('should export createServerSkillAgent function', async () => {
    const { createServerSkillAgent } = await import('../skill-agent.js');
    expect(typeof createServerSkillAgent).toBe('function');
  });
});
