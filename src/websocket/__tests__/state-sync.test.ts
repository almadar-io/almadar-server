/**
 * @fileoverview Unit tests for state sync WebSocket handler
 * @module @almadar/server/websocket/state-sync.test
 */

import { describe, it, expect, vi } from 'vitest';

// Mock the db module — state-sync imports getAuth from it
vi.mock('../../lib/db.js', () => ({
  db: { collection: vi.fn() },
  getFirestore: vi.fn(() => ({ collection: vi.fn() })),
  getAuth: vi.fn(() => ({
    verifyIdToken: vi.fn(),
    getUser: vi.fn(),
  })),
  admin: {},
}));

describe('State Sync WebSocket', () => {
  it('should export setupStateSyncWebSocket function', async () => {
    const { setupStateSyncWebSocket } = await import('../state-sync.js');
    expect(typeof setupStateSyncWebSocket).toBe('function');
  });
});
