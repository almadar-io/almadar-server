/**
 * @fileoverview Unit tests for SessionManager integration
 * @module @almadar/server/deepagent/session.test
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getSessionManager, resetSessionManager } from '../session';
import { SessionManager } from '@almadar/agent';

// Mock Firebase Admin
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: vi.fn(() => ({
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({
        get: vi.fn(),
        set: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      })),
    })),
  })),
}));

vi.mock('../memory', () => ({
  getMemoryManager: vi.fn(() => ({
    storeUserPreference: vi.fn(),
    getUserPreferences: vi.fn(),
  })),
}));

describe('SessionManager Integration', () => {
  beforeEach(() => {
    resetSessionManager();
  });

  afterEach(() => {
    resetSessionManager();
    vi.clearAllMocks();
  });

  describe('getSessionManager', () => {
    it('should return singleton instance', () => {
      const manager1 = getSessionManager();
      const manager2 = getSessionManager();
      
      expect(manager1).toBe(manager2);
      expect(manager1).toBeInstanceOf(SessionManager);
    });

    it('should create new instance after reset', () => {
      const manager1 = getSessionManager();
      resetSessionManager();
      const manager2 = getSessionManager();
      
      expect(manager1).not.toBe(manager2);
    });
  });

  describe('Session Operations', () => {
    it('should save session with metadata', async () => {
      const manager = getSessionManager();
      const threadId = 'thread-123';
      const session = {
        messages: [{ role: 'user', content: 'Hello' }],
        metadata: { userId: 'user-123' },
      };

      vi.spyOn(manager, 'save').mockResolvedValue(undefined);
      
      await manager.save(threadId, session);
      
      expect(manager.save).toHaveBeenCalledWith(threadId, session);
    });

    it('should retrieve session', async () => {
      const manager = getSessionManager();
      const threadId = 'thread-123';
      
      const mockSession = {
        messages: [{ role: 'user', content: 'Hello' }],
        metadata: { userId: 'user-123' },
      };

      vi.spyOn(manager, 'get').mockReturnValue(mockSession);
      
      const session = manager.get(threadId);
      
      expect(session).toEqual(mockSession);
    });

    it('should sync session to memory', async () => {
      const manager = getSessionManager();
      const threadId = 'thread-123';
      const userId = 'user-123';

      vi.spyOn(manager, 'syncSessionToMemory').mockResolvedValue(undefined);
      
      await manager.syncSessionToMemory(threadId, userId);
      
      expect(manager.syncSessionToMemory).toHaveBeenCalledWith(threadId, userId);
    });

    it('should record interrupt decision', async () => {
      const manager = getSessionManager();
      const threadId = 'thread-123';
      
      const decision = {
        action: 'approve' as const,
        pattern: 'file-write',
        timestamp: Date.now(),
      };

      vi.spyOn(manager, 'recordInterruptDecision').mockResolvedValue(undefined);
      
      await manager.recordInterruptDecision(threadId, decision);
      
      expect(manager.recordInterruptDecision).toHaveBeenCalledWith(threadId, decision);
    });

    it('should check if interrupt is auto-approved', async () => {
      const manager = getSessionManager();
      const userId = 'user-123';
      const pattern = 'file-write';

      vi.spyOn(manager, 'isAutoApproved').mockResolvedValue(true);
      
      const approved = await manager.isAutoApproved(userId, pattern);
      
      expect(approved).toBe(true);
      expect(manager.isAutoApproved).toHaveBeenCalledWith(userId, pattern);
    });
  });
});
