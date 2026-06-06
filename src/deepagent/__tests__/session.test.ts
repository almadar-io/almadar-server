/**
 * @fileoverview Unit tests for SessionStore compatibility stub
 * @module @almadar/server/deepagent/session.test
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getSessionStore, resetSessionStore } from '../session';

describe('SessionStore Compatibility Stub', () => {
  beforeEach(() => {
    resetSessionStore();
  });

  afterEach(() => {
    resetSessionStore();
  });

  describe('getSessionStore', () => {
    it('should throw with migration message', async () => {
      await expect(getSessionStore()).rejects.toThrow(
        'getSessionStore() is deprecated',
      );
    });
  });

  describe('resetSessionStore', () => {
    it('should be a no-op', () => {
      expect(() => resetSessionStore()).not.toThrow();
    });
  });
});
