/**
 * @fileoverview Unit tests for OrbitalMemory compatibility stub
 * @module @almadar/server/deepagent/memory.test
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getOrbitalMemory, resetOrbitalMemory } from '../memory';

describe('OrbitalMemory Compatibility Stub', () => {
  beforeEach(() => {
    resetOrbitalMemory();
  });

  afterEach(() => {
    resetOrbitalMemory();
  });

  describe('getOrbitalMemory', () => {
    it('should throw with migration message', async () => {
      await expect(getOrbitalMemory()).rejects.toThrow(
        'getOrbitalMemory() is deprecated',
      );
    });
  });

  describe('resetOrbitalMemory', () => {
    it('should be a no-op', () => {
      expect(() => resetOrbitalMemory()).not.toThrow();
    });
  });
});
