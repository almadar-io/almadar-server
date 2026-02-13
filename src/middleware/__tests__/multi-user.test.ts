/**
 * @fileoverview Unit tests for multi-user middleware
 * @module @almadar/server/middleware/multi-user.test
 */

import { describe, it, expect } from 'vitest';

describe('Multi-User Middleware', () => {
  it('should export verifyFirebaseAuth function', async () => {
    const { verifyFirebaseAuth } = await import('../multi-user.js');
    expect(typeof verifyFirebaseAuth).toBe('function');
  });

  it('should export multiUserMiddleware function', async () => {
    const { multiUserMiddleware } = await import('../multi-user.js');
    expect(typeof multiUserMiddleware).toBe('function');
  });
});
