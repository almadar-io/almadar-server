/**
 * @fileoverview Unit tests for skill agent factory
 * @module @almadar/server/deepagent/skill-agent.test
 */

import { describe, it, expect } from 'vitest';

describe('createServerSkillAgent', () => {
  it('should export createServerSkillAgent function', async () => {
    const { createServerSkillAgent } = await import('../skill-agent.js');
    expect(typeof createServerSkillAgent).toBe('function');
  });
});
