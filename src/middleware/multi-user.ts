/**
 * Multi-User Middleware
 *
 * Provides user isolation and session ownership using Firebase Auth.
 *
 * @packageDocumentation
 */

import { getMultiUserManager, createUserContext } from '@almadar-io/agent';
import { getAuth } from '../lib/db.js';
import type { Request, Response, NextFunction } from 'express';

// Extend Express Request to include Firebase user
declare global {
  namespace Express {
    interface Request {
      user?: {
        uid: string;
        email?: string;
        roles?: string[];
        orgId?: string;
      };
      userContext?: {
        userId: string;
        orgId?: string;
        roles?: string[];
      };
    }
  }
}

/**
 * Middleware to set up user context from Firebase Auth
 */
export async function multiUserMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const userId = req.user?.uid;

  if (!userId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  // Create user context
  req.userContext = createUserContext(userId, {
    orgId: req.user?.orgId,
    roles: req.user?.roles ?? ['user'],
  });

  // Assign session ownership when creating new sessions
  const originalJson = res.json.bind(res);
  res.json = (body: unknown) => {
    if (body && typeof body === 'object' && 'threadId' in body) {
      const multiUser = getMultiUserManager();
      multiUser.assignSessionOwnership(
        (body as { threadId: string }).threadId,
        userId,
      );
    }
    return originalJson(body);
  };

  next();
}

/**
 * Verify Firebase Auth token from Authorization header
 */
export async function verifyFirebaseAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'No token provided' });
    return;
  }

  const token = authHeader.split('Bearer ')[1];

  try {
    const decodedToken = await getAuth().verifyIdToken(token);

    // Get custom claims for roles/org
    const user = await getAuth().getUser(decodedToken.uid);

    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email,
      roles: (user.customClaims?.roles as string[]) ?? ['user'],
      orgId: user.customClaims?.orgId as string,
    };

    next();
  } catch (error) {
    console.error('Token verification failed:', error);
    res.status(401).json({ error: 'Invalid token' });
  }
}
