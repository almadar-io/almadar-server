/**
 * @fileoverview Unit tests for MemoryManager integration
 * @module @almadar/server/deepagent/memory.test
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock the db module to provide a fake Firestore without requiring Firebase init
vi.mock('../../lib/db.js', () => {
  const mockCollection = vi.fn(() => ({
    doc: vi.fn(() => ({
      get: vi.fn(),
      set: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    })),
    where: vi.fn(() => ({
      get: vi.fn(() => Promise.resolve({ docs: [], empty: true })),
    })),
    orderBy: vi.fn(() => ({
      limit: vi.fn(() => ({
        get: vi.fn(() => Promise.resolve({ docs: [], empty: true })),
      })),
    })),
  }));
  const mockDb = { collection: mockCollection, batch: vi.fn(() => ({
    set: vi.fn(), update: vi.fn(), delete: vi.fn(), commit: vi.fn(() => Promise.resolve()),
  })) };
  return {
    db: mockDb,
    getFirestore: vi.fn(() => mockDb),
    getAuth: vi.fn(),
    admin: {},
  };
});

import { getMemoryManager as getMemoryManagerAsync, resetMemoryManager } from '../memory';

/**
 * MemoryManager test interface.
 * Matches the full API from @almadar-io/agent (source), which may be ahead of
 * the published npm version installed in this package.
 */
interface MemoryManagerLike {
  updateUserPreferences(userId: string, prefs: Record<string, unknown>): Promise<void>;
  getUserPreferences(userId: string): Promise<Record<string, unknown> | null>;
  recordGeneration(userId: string, session: Record<string, unknown>): Promise<string>;
  updateProjectContext(projectId: string, update: Record<string, unknown>): Promise<void>;
  recordFeedback(sessionId: string, feedback: Record<string, unknown>): Promise<void>;
  updatePatternAffinity(userId: string, patternId: string, outcome: string): Promise<void>;
  getUserPatterns(userId: string): Promise<Record<string, unknown>[]>;
  recordInterruptDecision(sessionId: string, userId: string, data: Record<string, unknown>): Promise<void>;
  shouldAutoApproveTool(userId: string, toolName: string): Promise<boolean>;
  [key: string]: unknown;
}

/** Typed wrapper: await the async getter and cast to MemoryManagerLike */
async function getMemoryManager(): Promise<MemoryManagerLike> {
  return await getMemoryManagerAsync() as unknown as MemoryManagerLike;
}

describe('MemoryManager Integration', () => {
  beforeEach(() => {
    resetMemoryManager();
  });

  afterEach(() => {
    resetMemoryManager();
    vi.clearAllMocks();
  });

  describe('getMemoryManager', () => {
    it('should return singleton instance', async () => {
      const manager1 = await getMemoryManager();
      const manager2 = await getMemoryManager();

      expect(manager1).toBe(manager2);
    });

    it('should create new instance after reset', async () => {
      const manager1 = await getMemoryManager();
      resetMemoryManager();
      const manager2 = await getMemoryManager();

      expect(manager1).not.toBe(manager2);
    });
  });

  describe('Memory Operations', () => {
    it('should have updateUserPreferences method', async () => {
      const manager = await getMemoryManager();
      const userId = 'test-user-123';

      vi.spyOn(manager, 'updateUserPreferences').mockResolvedValue(undefined);

      const preferences = {
        namingConvention: 'camelCase' as const,
        validationStyle: 'strict' as const,
      };

      await manager.updateUserPreferences(userId, preferences);

      expect(manager.updateUserPreferences).toHaveBeenCalledWith(userId, preferences);
    });

    it('should have getUserPreferences method', async () => {
      const manager = await getMemoryManager();
      const userId = 'test-user-123';

      const mockPreferences = {
        id: 'pref-123',
        userId,
        namingConvention: 'PascalCase' as const,
        validationStyle: 'strict' as const,
        preferredPatterns: [],
        commonEntities: [],
        commonTraits: [],
        learnedAt: new Date(),
        confidence: 0.8,
      };

      vi.spyOn(manager, 'getUserPreferences').mockResolvedValue(mockPreferences);

      const prefs = await manager.getUserPreferences(userId);

      expect(prefs).toEqual(mockPreferences);
      expect(manager.getUserPreferences).toHaveBeenCalledWith(userId);
    });

    it('should have recordGeneration method', async () => {
      const manager = await getMemoryManager();

      vi.spyOn(manager, 'recordGeneration').mockResolvedValue('gen-123');

      const session = {
        threadId: 'thread-123',
        prompt: 'Test generation',
        skill: 'kflow-orbitals',
        entities: ['Task'],
        patterns: ['entity-table'],
        success: false,
      };

      await manager.recordGeneration('user-123', session);

      expect(manager.recordGeneration).toHaveBeenCalledWith('user-123', session);
    });

    it('should have updateProjectContext method', async () => {
      const manager = await getMemoryManager();

      vi.spyOn(manager, 'updateProjectContext').mockResolvedValue(undefined);

      const update = {
        userId: 'user-123',
        existingEntities: ['Task', 'User'],
      };

      await manager.updateProjectContext('project-456', update);

      expect(manager.updateProjectContext).toHaveBeenCalledWith('project-456', update);
    });

    it('should have recordFeedback method', async () => {
      const manager = await getMemoryManager();

      vi.spyOn(manager, 'recordFeedback').mockResolvedValue(undefined);

      const feedback = {
        userId: 'user-123',
        type: 'positive' as const,
        rating: 5,
      };

      await manager.recordFeedback('session-456', feedback);

      expect(manager.recordFeedback).toHaveBeenCalledWith('session-456', feedback);
    });
  });

  describe('Pattern Management', () => {
    it('should have updatePatternAffinity method', async () => {
      const manager = await getMemoryManager();

      vi.spyOn(manager, 'updatePatternAffinity').mockResolvedValue(undefined);

      await manager.updatePatternAffinity('user-123', 'pattern-456', 'success');

      expect(manager.updatePatternAffinity).toHaveBeenCalledWith('user-123', 'pattern-456', 'success');
    });

    it('should have getUserPatterns method', async () => {
      const manager = await getMemoryManager();

      const mockPatterns = [
        { id: 'p1', userId: 'user-123', patternId: 'auth', affinityScore: 0.9 },
        { id: 'p2', userId: 'user-123', patternId: 'crud', affinityScore: 0.8 },
      ];

      vi.spyOn(manager, 'getUserPatterns').mockResolvedValue(mockPatterns as any);

      const patterns = await manager.getUserPatterns('user-123');

      expect(patterns).toEqual(mockPatterns);
    });
  });

  describe('Interrupt Handling', () => {
    it('should have recordInterruptDecision method', async () => {
      const manager = await getMemoryManager();

      vi.spyOn(manager, 'recordInterruptDecision').mockResolvedValue(undefined);

      const interruptData = {
        toolName: 'file.write',
        toolArgs: { path: '/test' },
        decision: 'approved' as const,
      };

      await manager.recordInterruptDecision('session-123', 'user-123', interruptData);

      expect(manager.recordInterruptDecision).toHaveBeenCalledWith('session-123', 'user-123', interruptData);
    });

    it('should have shouldAutoApproveTool method', async () => {
      const manager = await getMemoryManager();

      vi.spyOn(manager, 'shouldAutoApproveTool').mockResolvedValue(true);

      const shouldApprove = await manager.shouldAutoApproveTool('user-123', 'file.write');

      expect(shouldApprove).toBe(true);
      expect(manager.shouldAutoApproveTool).toHaveBeenCalledWith('user-123', 'file.write');
    });
  });
});
