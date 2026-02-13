/**
 * @fileoverview Unit tests for multi-user middleware
 * @module @almadar/server/middleware/multi-user.test
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { multiUserMiddleware, verifyFirebaseAuth } from '../multi-user';
import type { Request, Response, NextFunction } from 'express';

// Mock Firebase Admin Auth
const mockVerifyIdToken = vi.fn();
vi.mock('firebase-admin/auth', () => ({
  getAuth: vi.fn(() => ({
    verifyIdToken: mockVerifyIdToken,
  })),
}));

vi.mock('@almadar/agent', () => ({
  getMultiUserManager: vi.fn(() => ({
    setUserSession: vi.fn(),
    getUserSessions: vi.fn(() => []),
  })),
  createUserContext: vi.fn((userId, options) => ({
    userId,
    ...options,
  })),
}));

describe('Multi-User Middleware', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockReq = {
      headers: {},
    };
    mockRes = {
      status: vi.fn(() => mockRes as Response),
      json: vi.fn(() => mockRes as Response),
    };
    mockNext = vi.fn();
    vi.clearAllMocks();
  });

  describe('verifyFirebaseAuth', () => {
    it('should reject request without authorization header', async () => {
      const middleware = verifyFirebaseAuth();
      
      await middleware(mockReq as Request, mockRes as Response, mockNext);
      
      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Unauthorized' });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject request with invalid token format', async () => {
      mockReq.headers = { authorization: 'InvalidFormat token123' };
      const middleware = verifyFirebaseAuth();
      
      await middleware(mockReq as Request, mockRes as Response, mockNext);
      
      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should verify valid token and attach user', async () => {
      const mockUser = {
        uid: 'user-123',
        email: 'test@example.com',
        roles: ['user'],
        orgId: 'org-456',
      };
      mockVerifyIdToken.mockResolvedValue(mockUser);
      
      mockReq.headers = { authorization: 'Bearer valid-token' };
      const middleware = verifyFirebaseAuth();
      
      await middleware(mockReq as Request, mockRes as Response, mockNext);
      
      expect(mockVerifyIdToken).toHaveBeenCalledWith('valid-token');
      expect(mockReq.user).toEqual(mockUser);
      expect(mockNext).toHaveBeenCalled();
    });

    it('should handle token verification errors', async () => {
      mockVerifyIdToken.mockRejectedValue(new Error('Invalid token'));
      
      mockReq.headers = { authorization: 'Bearer invalid-token' };
      const middleware = verifyFirebaseAuth();
      
      await middleware(mockReq as Request, mockRes as Response, mockNext);
      
      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Invalid token' });
    });
  });

  describe('multiUserMiddleware', () => {
    it('should reject request without user', async () => {
      await multiUserMiddleware(mockReq as Request, mockRes as Response, mockNext);
      
      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Unauthorized' });
    });

    it('should create user context for authenticated request', async () => {
      mockReq.user = {
        uid: 'user-123',
        email: 'test@example.com',
        roles: ['user'],
        orgId: 'org-456',
      };
      
      await multiUserMiddleware(mockReq as Request, mockRes as Response, mockNext);
      
      expect(mockReq.userContext).toBeDefined();
      expect(mockReq.userContext?.userId).toBe('user-123');
      expect(mockReq.userContext?.orgId).toBe('org-456');
      expect(mockNext).toHaveBeenCalled();
    });

    it('should assign default role when not provided', async () => {
      mockReq.user = {
        uid: 'user-123',
        email: 'test@example.com',
      };
      
      await multiUserMiddleware(mockReq as Request, mockRes as Response, mockNext);
      
      expect(mockReq.userContext?.roles).toEqual(['user']);
    });
  });
});
