/**
 * @fileoverview Unit tests for state sync WebSocket handler
 * @module @almadar/server/websocket/state-sync.test
 */

import { describe, it, expect } from 'vitest';

describe('State Sync WebSocket', () => {
  it('should export setupStateSyncWebSocket function', async () => {
    const { setupStateSyncWebSocket } = await import('../state-sync.js');
    expect(typeof setupStateSyncWebSocket).toBe('function');
  });
});
