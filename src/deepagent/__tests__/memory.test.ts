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
        get: vi.fn(() => Promise.resolve({ docs: [] })),
      })),
      orderBy: vi.fn(() => ({
        limit: vi.fn(() => ({
          get: vi.fn(() => Promise.resolve({ docs: [] })),
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
    it('should store user preferences', async () => {
      const manager = getMemoryManager();
      const userId = 'test-user-123';
      
      const preferences = {
        preferredColorScheme: 'dark',
        defaultFramework: 'react',
      };

      vi.spyOn(manager, 'storeUserPreference').mockResolvedValue(undefined);
      
      await manager.storeUserPreference(userId, 'colorScheme', preferences.preferredColorScheme);
      
      expect(manager.storeUserPreference).toHaveBeenCalledWith(
        userId,
        'colorScheme',
        preferences.preferredColorScheme
      );
    });

    it('should retrieve user preferences', async () => {
      const manager = getMemoryManager();
      const userId = 'test-user-123';
      
      const mockPreferences = {
        preferredColorScheme: 'dark',
        defaultFramework: 'react',
      };

      vi.spyOn(manager, 'getUserPreferences').mockResolvedValue(mockPreferences);
      
      const prefs = await manager.getUserPreferences(userId);
      
      expect(prefs).toEqual(mockPreferences);
    });

    it('should store project context', async () => {
      const manager = getMemoryManager();
      const projectId = 'project-456';
      
      const context = {
        techStack: ['react', 'typescript'],
        patterns: ['mvc', 'repository'],
      };

      vi.spyOn(manager, 'storeProjectContext').mockResolvedValue(undefined);
      
      await manager.storeProjectContext(projectId, context);
      
      expect(manager.storeProjectContext).toHaveBeenCalledWith(projectId, context);
    });

    it('should record generation outcome', async () => {
      const manager = getMemoryManager();
      const userId = 'test-user-123';
      
      const outcome = {
        success: true,
        patternUsed: 'component-generation',
        quality: 0.95,
      };

      vi.spyOn(manager, 'recordGenerationOutcome').mockResolvedValue(undefined);
      
      await manager.recordGenerationOutcome(userId, 'pattern-123', outcome);
      
      expect(manager.recordGenerationOutcome).toHaveBeenCalledWith(
        userId,
        'pattern-123',
        outcome
      );
    });
  });

  describe('Agentic Search', () => {
    it('should perform agentic search', async () => {
      const manager = getMemoryManager();
      const userId = 'test-user-123';
      const query = 'authentication patterns';

      const mockResults = {
        results: [
          { type: 'pattern', id: 'auth-1', relevance: 0.95 },
          { type: 'memory', id: 'mem-1', relevance: 0.87 },
        ],
        insights: {
          patterns: ['jwt-auth', 'session-auth'],
          trends: ['increasing security focus'],
        },
      };

      vi.spyOn(manager, 'agenticSearch').mockResolvedValue(mockResults);
      
      const results = await manager.agenticSearch(userId, query);
      
      expect(results).toEqual(mockResults);
      expect(manager.agenticSearch).toHaveBeenCalledWith(userId, query);
    });
  });
});
