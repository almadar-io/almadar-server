/**
 * @fileoverview Unit tests for state sync WebSocket handler
 * @module @almadar/server/websocket/state-sync.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setupStateSyncWebSocket } from '../state-sync';
import type { Server } from 'socket.io';

// Mock Socket.IO
const mockSocket = {
  id: 'socket-123',
  handshake: {
    auth: { token: 'valid-token' },
  },
  join: vi.fn(),
  leave: vi.fn(),
  on: vi.fn(),
  emit: vi.fn(),
  to: vi.fn(() => ({
    emit: vi.fn(),
  })),
};

const mockIo = {
  on: vi.fn((event, handler) => {
    if (event === 'connection') {
      handler(mockSocket);
    }
  }),
  use: vi.fn(),
};

// Mock Firebase Auth
vi.mock('firebase-admin/auth', () => ({
  getAuth: vi.fn(() => ({
    verifyIdToken: vi.fn(() => Promise.resolve({
      uid: 'user-123',
      email: 'test@example.com',
    })),
  })),
}));

// Mock StateSyncManager
vi.mock('@almadar/agent', () => ({
  getStateSyncManager: vi.fn(() => ({
    registerClient: vi.fn(),
    unregisterClient: vi.fn(),
    handleClientChange: vi.fn(),
    broadcastChange: vi.fn(),
  })),
}));

describe('State Sync WebSocket', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should setup WebSocket handlers', () => {
    setupStateSyncWebSocket(mockIo as unknown as Server);

    expect(mockIo.on).toHaveBeenCalledWith('connection', expect.any(Function));
  });

  it('should authenticate socket connections', () => {
    const { getAuth } = require('firebase-admin/auth');
    
    setupStateSyncWebSocket(mockIo as unknown as Server);

    // Socket auth should be checked
    expect(mockIo.use).toHaveBeenCalled();
  });

  it('should handle client connections', () => {
    setupStateSyncWebSocket(mockIo as unknown as Server);

    expect(mockSocket.join).toHaveBeenCalledWith(expect.any(String));
  });

  it('should listen for stateChange events', () => {
    setupStateSyncWebSocket(mockIo as unknown as Server);

    expect(mockSocket.on).toHaveBeenCalledWith('stateChange', expect.any(Function));
  });

  it('should listen for subscribe events', () => {
    setupStateSyncWebSocket(mockIo as unknown as Server);

    expect(mockSocket.on).toHaveBeenCalledWith('subscribe', expect.any(Function));
  });

  it('should listen for resolveConflict events', () => {
    setupStateSyncWebSocket(mockIo as unknown as Server);

    expect(mockSocket.on).toHaveBeenCalledWith('resolveConflict', expect.any(Function));
  });

  it('should handle disconnections', () => {
    setupStateSyncWebSocket(mockIo as unknown as Server);

    expect(mockSocket.on).toHaveBeenCalledWith('disconnect', expect.any(Function));
  });
});
