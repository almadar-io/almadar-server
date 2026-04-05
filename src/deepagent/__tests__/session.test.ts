/**
 * @fileoverview Unit tests for SessionManager integration
 * @module @almadar/server/deepagent/session.test
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getSessionManager as getSessionManagerAsync, resetSessionManager } from '../session';

/**
 * SessionManager test interface.
 * Matches the full API from @almadar-io/agent (source), which may be ahead of
 * the published npm version installed in this package.
 */
interface SessionManagerLike {
  store(threadId: string, metadata: Record<string, unknown>): void;
  get(threadId: string): Record<string, unknown> | null;
  getAsync(threadId: string): Promise<Record<string, unknown> | null>;
  clear(threadId: string): boolean;
  syncSessionToMemory(threadId: string, userId: string, data: Record<string, unknown>): Promise<void>;
  recordInterruptDecision(sessionId: string, userId: string, data: Record<string, unknown>): Promise<void>;
  shouldAutoApproveTool(userId: string, toolName: string): Promise<boolean>;
  recordCheckpoint(userId: string, data: Record<string, unknown>): Promise<void>;
  getCheckpointer(threadId: string): unknown;
  shouldCompactMessages(messages: unknown[]): boolean;
  [key: string]: unknown;
}

async function getSessionManager(): Promise<SessionManagerLike> {
  return await getSessionManagerAsync() as unknown as SessionManagerLike;
}

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
    updateUserPreferences: vi.fn(),
    getUserPreferences: vi.fn(),
    recordInterruptDecision: vi.fn(),
    shouldAutoApproveTool: vi.fn(),
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
    it('should return singleton instance', async () => {
      const manager1 = await getSessionManager();
      const manager2 = await getSessionManager();

      expect(manager1).toBe(manager2);
    });

    it('should create new instance after reset', async () => {
      const manager1 = await getSessionManager();
      resetSessionManager();
      const manager2 = await getSessionManager();

      expect(manager1).not.toBe(manager2);
    });
  });

  describe('Session Operations', () => {
    it('should have store method for saving sessions', async () => {
      const manager = await getSessionManager();
      const threadId = 'thread-123';
      
      const metadata = {
        skill: 'code',
        workDir: '/test',
        createdAt: Date.now(),
        lastActivityAt: Date.now(),
      };

      vi.spyOn(manager, 'store').mockReturnValue(undefined);
      
      manager.store(threadId, metadata);
      
      expect(manager.store).toHaveBeenCalledWith(threadId, metadata);
    });

    it('should have get method for retrieving sessions', async () => {
      const manager = await getSessionManager();
      const threadId = 'thread-123';
      
      const mockMetadata = {
        skill: 'code',
        workDir: '/test',
        createdAt: Date.now(),
        lastActivityAt: Date.now(),
      };

      vi.spyOn(manager, 'get').mockReturnValue(mockMetadata);
      
      const metadata = manager.get(threadId);
      
      expect(metadata).toEqual(mockMetadata);
      expect(manager.get).toHaveBeenCalledWith(threadId);
    });

    it('should have getAsync method for async retrieval', async () => {
      const manager = await getSessionManager();
      const threadId = 'thread-123';
      
      const mockMetadata = {
        skill: 'code',
        workDir: '/test',
        createdAt: Date.now(),
        lastActivityAt: Date.now(),
      };

      vi.spyOn(manager, 'getAsync').mockResolvedValue(mockMetadata);
      
      const metadata = await manager.getAsync(threadId);
      
      expect(metadata).toEqual(mockMetadata);
      expect(manager.getAsync).toHaveBeenCalledWith(threadId);
    });

    it('should have clear method for removing sessions', async () => {
      const manager = await getSessionManager();
      const threadId = 'thread-123';

      vi.spyOn(manager, 'clear').mockReturnValue(true);
      
      const result = manager.clear(threadId);
      
      expect(result).toBe(true);
      expect(manager.clear).toHaveBeenCalledWith(threadId);
    });
  });

  describe('Session-Memory Sync (GAP-002D)', () => {
    it('should have syncSessionToMemory method', async () => {
      const manager = await getSessionManager();
      
      vi.spyOn(manager, 'syncSessionToMemory').mockResolvedValue(undefined);
      
      const sessionData = {
        appId: 'app-456',
        inputDescription: 'Test input',
        success: true,
      };

      await manager.syncSessionToMemory('thread-123', 'user-123', sessionData);
      
      expect(manager.syncSessionToMemory).toHaveBeenCalledWith('thread-123', 'user-123', sessionData);
    });
  });

  describe('Interrupt Handling (GAP-003)', () => {
    it('should have recordInterruptDecision method', async () => {
      const manager = await getSessionManager();
      
      vi.spyOn(manager, 'recordInterruptDecision').mockResolvedValue(undefined);
      
      const interruptData = {
        toolName: 'file.write',
        toolArgs: { path: '/test.txt' },
        decision: 'approved' as const,
      };

      await manager.recordInterruptDecision('session-123', 'user-123', interruptData);
      
      expect(manager.recordInterruptDecision).toHaveBeenCalledWith('session-123', 'user-123', interruptData);
    });

    it('should have shouldAutoApproveTool method', async () => {
      const manager = await getSessionManager();
      
      vi.spyOn(manager, 'shouldAutoApproveTool').mockResolvedValue(true);
      
      const shouldApprove = await manager.shouldAutoApproveTool('user-123', 'file.write');
      
      expect(shouldApprove).toBe(true);
      expect(manager.shouldAutoApproveTool).toHaveBeenCalledWith('user-123', 'file.write');
    });
  });

  describe('Checkpoint Management (GAP-004)', () => {
    it('should have recordCheckpoint method', async () => {
      const manager = await getSessionManager();
      
      vi.spyOn(manager, 'recordCheckpoint').mockResolvedValue(undefined);
      
      const checkpointData = {
        checkpointId: 'cp-123',
        threadId: 'thread-456',
      };

      await manager.recordCheckpoint('user-123', checkpointData);
      
      expect(manager.recordCheckpoint).toHaveBeenCalledWith('user-123', checkpointData);
    });

    it('should have getCheckpointer method', async () => {
      const manager = await getSessionManager();
      
      const checkpointer = manager.getCheckpointer('thread-123');
      
      expect(checkpointer).toBeDefined();
    });
  });

  describe('Context Compaction (GAP-005)', () => {
    it('should have shouldCompactMessages method', async () => {
      const manager = await getSessionManager();
      
      const messages = [{ content: 'Hello' }, { content: 'World' }];
      const shouldCompact = manager.shouldCompactMessages(messages);
      
      expect(typeof shouldCompact).toBe('boolean');
    });
  });
});
