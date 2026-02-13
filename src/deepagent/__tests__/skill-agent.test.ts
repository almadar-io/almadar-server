/**
 * @fileoverview Unit tests for skill agent factory
 * @module @almadar/server/deepagent/skill-agent.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createServerSkillAgent } from '../skill-agent';

// Mock dependencies
vi.mock('@almadar/agent', () => ({
  Agent: vi.fn().mockImplementation(() => ({
    withConfig: vi.fn().mockReturnThis(),
    withTools: vi.fn().mockReturnThis(),
    withInterrupts: vi.fn().mockReturnThis(),
    withMemory: vi.fn().mockReturnThis(),
    withCheckpointer: vi.fn().mockReturnThis(),
  })),
  MemoryManager: vi.fn(),
  FirestoreCheckpointer: vi.fn().mockImplementation(() => ({
    save: vi.fn(),
    load: vi.fn(),
  })),
}));

vi.mock('@almadar/skills', () => ({
  SkillRegistry: vi.fn().mockImplementation(() => ({
    getSkill: vi.fn((name) => ({
      name,
      execute: vi.fn(),
      metadata: { description: `Test ${name}` },
    })),
    listSkills: vi.fn(() => ['file', 'shell']),
  })),
}));

vi.mock('../memory', () => ({
  getMemoryManager: vi.fn(() => ({
    storeUserPreference: vi.fn(),
    getUserPreferences: vi.fn(),
  })),
}));

describe('createServerSkillAgent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create agent with default config', () => {
    const agent = createServerSkillAgent({
      userId: 'user-123',
      allowedSkills: ['file', 'shell'],
    });

    expect(agent).toBeDefined();
  });

  it('should configure memory integration', () => {
    const agent = createServerSkillAgent({
      userId: 'user-123',
      allowedSkills: ['file'],
      memoryConfig: {
        storeResults: true,
        storeErrors: true,
      },
    });

    expect(agent).toBeDefined();
  });

  it('should configure interrupt handling', () => {
    const agent = createServerSkillAgent({
      userId: 'user-123',
      allowedSkills: ['file', 'shell'],
      autoApprove: ['file.read'],
    });

    expect(agent).toBeDefined();
  });

  it('should include skills in agent', () => {
    const { SkillRegistry } = require('@almadar/skills');
    
    createServerSkillAgent({
      userId: 'user-123',
      allowedSkills: ['file', 'shell'],
    });

    expect(SkillRegistry).toHaveBeenCalled();
  });
});
