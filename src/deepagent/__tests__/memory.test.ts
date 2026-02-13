/**
 * @fileoverview Unit tests for MemoryManager integration
 * @module @almadar/server/deepagent/memory.test
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getMemoryManager, resetMemoryManager } from '../memory';
import { MemoryManager } from '@almadar/agent';

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
      where: vi.fn(() => ({
        get: vi.fn(() => Promise.resolve({ docs: [], empty: true })),
      })),
      orderBy: vi.fn(() => ({
        limit: vi.fn(() => ({
          get: vi.fn(() => Promise.resolve({ docs: [], empty: true })),
        })),
      })),
    })),
    batch: vi.fn(() => ({
      set: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      commit: vi.fn(() => Promise.resolve()),
    })),
  })),
}));

describe('MemoryManager Integration', () => {
  beforeEach(() => {
    resetMemoryManager();
  });

  afterEach(() => {
    resetMemoryManager();
    vi.clearAllMocks();
  });

  describe('getMemoryManager', () => {
    it('should return singleton instance', () => {
      const manager1 = getMemoryManager();
      const manager2 = getMemoryManager();
      
      expect(manager1).toBe(manager2);
      expect(manager1).toBeInstanceOf(MemoryManager);
    });

    it('should create new instance after reset', () => {
      const manager1 = getMemoryManager();
      resetMemoryManager();
      const manager2 = getMemoryManager();
      
      expect(manager1).not.toBe(manager2);
    });
  });

  describe('Memory Operations', () => {
    it('should have updateUserPreferences method', async () => {
      const manager = getMemoryManager();
      const userId = 'test-user-123';
      
      // Mock the method
      vi.spyOn(manager, 'updateUserPreferences').mockResolvedValue(undefined);
      
      const preferences = {
        namingConvention: 'camelCase' as const,
        validationStyle: 'strict' as const,
      };

      await manager.updateUserPreferences(userId, preferences);
      
      expect(manager.updateUserPreferences).toHaveBeenCalledWith(userId, preferences);
    });

    it('should have getUserPreferences method', async () => {
      const manager = getMemoryManager();
      const userId = 'test-user-123';
      
      const mockPreferences = {
        id: 'pref-123',
        userId,
        namingConvention: 'PascalCase',
        validationStyle: 'strict',
        preferredPatterns: [],
        avoidedPatterns: [],
        customRules: [],
        learnedAt: Date.now(),
      };

      vi.spyOn(manager, 'getUserPreferences').mockResolvedValue(mockPreferences);
      
      const prefs = await manager.getUserPreferences(userId);
      
      expect(prefs).toEqual(mockPreferences);
      expect(manager.getUserPreferences).toHaveBeenCalledWith(userId);
    });

    it('should have recordGeneration method', async () => {
      const manager = getMemoryManager();
      
      vi.spyOn(manager, 'recordGeneration').mockResolvedValue(undefined);
      
      const session = {
        id: 'gen-123',
        userId: 'user-123',
        appId: 'app-456',
        description: 'Test generation',
        status: 'in_progress' as const,
        createdAt: Date.now(),
      };

      await manager.recordGeneration(session);
      
      expect(manager.recordGeneration).toHaveBeenCalledWith(session);
    });

    it('should have updateProjectContext method', async () => {
      const manager = getMemoryManager();
      
      vi.spyOn(manager, 'updateProjectContext').mockResolvedValue(undefined);
      
      const context = {
        appId: 'project-456',
        techStack: ['react', 'typescript'],
        patterns: ['mvc', 'repository'],
      };

      await manager.updateProjectContext(context);
      
      expect(manager.updateProjectContext).toHaveBeenCalledWith(context);
    });

    it('should have recordFeedback method', async () => {
      const manager = getMemoryManager();
      
      vi.spyOn(manager, 'recordFeedback').mockResolvedValue(undefined);
      
      const feedback = {
        id: 'fb-123',
        sessionId: 'session-456',
        userId: 'user-123',
        rating: 5,
        timestamp: Date.now(),
      };

      await manager.recordFeedback(feedback);
      
      expect(manager.recordFeedback).toHaveBeenCalledWith(feedback);
    });
  });

  describe('Pattern Management', () => {
    it('should have updatePatternAffinity method', async () => {
      const manager = getMemoryManager();
      
      vi.spyOn(manager, 'updatePatternAffinity').mockResolvedValue(undefined);
      
      await manager.updatePatternAffinity('user-123', 'pattern-456', true);
      
      expect(manager.updatePatternAffinity).toHaveBeenCalledWith('user-123', 'pattern-456', true);
    });

    it('should have getUserPatterns method', async () => {
      const manager = getMemoryManager();
      
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
      const manager = getMemoryManager();
      
      vi.spyOn(manager, 'recordInterruptDecision').mockResolvedValue(undefined);
      
      await manager.recordInterruptDecision('user-123', 'tool-456', 'approve');
      
      expect(manager.recordInterruptDecision).toHaveBeenCalledWith('user-123', 'tool-456', 'approve');
    });

    it('should have shouldAutoApproveTool method', async () => {
      const manager = getMemoryManager();
      
      vi.spyOn(manager, 'shouldAutoApproveTool').mockResolvedValue(true);
      
      const shouldApprove = await manager.shouldAutoApproveTool('user-123', 'file.write');
      
      expect(shouldApprove).toBe(true);
      expect(manager.shouldAutoApproveTool).toHaveBeenCalledWith('user-123', 'file.write');
    });
  });
});
