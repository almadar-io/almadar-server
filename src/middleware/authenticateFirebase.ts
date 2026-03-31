import { NextFunction, Request, Response } from 'express';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { getAuth } from '../lib/db.js';
import { env } from '../lib/env.js';
import { createLogger } from '../almadarLogger.js';

const authLog = createLogger('almadar:server:auth');

const BEARER_PREFIX = 'Bearer ';

/** Fake dev user injected when NODE_ENV=development and no auth header is present */
const DEV_USER: DecodedIdToken = {
  uid: 'dev-user-001',
  email: 'dev@localhost',
  email_verified: true,
  aud: 'dev-project',
  auth_time: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + 3600,
  iat: Math.floor(Date.now() / 1000),
  iss: 'https://securetoken.google.com/dev-project',
  sub: 'dev-user-001',
  firebase: {
    identities: {},
    sign_in_provider: 'custom',
  },
};

export async function authenticateFirebase(req: Request, res: Response, next: NextFunction) {
  const authorization = req.headers.authorization;

  // Dev bypass: in development mode, skip auth if no token is provided
  if (env.NODE_ENV === 'development' && (!authorization || !authorization.startsWith(BEARER_PREFIX))) {
    authLog.debug('auth:devBypass', { uid: DEV_USER.uid });
    req.firebaseUser = DEV_USER;
    res.locals.firebaseUser = DEV_USER;
    return next();
  }

  try {
    if (!authorization || !authorization.startsWith(BEARER_PREFIX)) {
      return res.status(401).json({ error: 'Authorization header missing or malformed' });
    }

    const token = authorization.slice(BEARER_PREFIX.length);
    const decodedToken = await getAuth().verifyIdToken(token);

    authLog.info('auth:verified', { uid: decodedToken.uid, email: decodedToken.email });
    req.firebaseUser = decodedToken;
    res.locals.firebaseUser = decodedToken;

    return next();
  } catch (error) {
    authLog.warn('auth:failed', { error: error instanceof Error ? error.message : String(error) });
    console.error('Firebase authentication failed:', error);
    return res.status(401).json({ error: 'Unauthorized' });
  }
}

export default authenticateFirebase;


