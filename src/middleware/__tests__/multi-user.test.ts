/**
 * @fileoverview Unit tests for multi-user middleware
 * @module @almadar/server/middleware/multi-user.test
 */

import { describe, it, expect, vi } from 'vitest';

// Mock the db module — multi-user imports getAuth from it
vi.mock('../../lib/db.js', () => ({
  db: { collection: vi.fn() },
  getFirestore: vi.fn(() => ({ collection: vi.fn() })),
  getAuth: vi.fn(() => ({
    verifyIdToken: vi.fn(),
    getUser: vi.fn(),
  })),
  admin: {},
}));

describe('Multi-User Middleware', () => {
  it('should export verifyFirebaseAuth function', async () => {
    const { verifyFirebaseAuth } = await import('../multi-user.js');
    expect(typeof verifyFirebaseAuth).toBe('function');
  });

  it('should export multiUserMiddleware function', async () => {
    const { multiUserMiddleware } = await import('../multi-user.js');
    expect(typeof multiUserMiddleware).toBe('function');
  });
});
