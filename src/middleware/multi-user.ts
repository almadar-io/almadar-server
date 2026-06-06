/**
 * Multi-User Middleware
 *
 * Provides user isolation and session ownership using Firebase Auth.
 * The DeepAgent `MultiUserManager` dependency has been removed;
 * ownership is now handled by the caller or by rabit's workspace model.
 *
 * @packageDocumentation
 */

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
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const userId = req.user?.uid;

  if (!userId) {
    next();
    return;
  }

  req.userContext = {
    userId,
    orgId: req.user?.orgId,
    roles: req.user?.roles ?? ['user'],
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
