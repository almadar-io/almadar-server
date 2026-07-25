import { NextFunction, Request, Response } from 'express';
import { getAuth } from '../lib/db.js';
import { createLogger } from '@almadar/logger';
import { resolveDevIdentity } from './devIdentity.js';

const authLog = createLogger('almadar:server:auth');

const BEARER_PREFIX = 'Bearer ';

export async function authenticateFirebase(req: Request, res: Response, next: NextFunction) {
  const authorization = req.headers.authorization;

  const devUser = resolveDevIdentity(authorization);
  if (devUser) {
    authLog.debug('auth:devBypass', { uid: devUser.uid, role: devUser['role'] });
    req.firebaseUser = devUser;
    res.locals.firebaseUser = devUser;
    return next();
  }

  try {
    if (!authorization || !authorization.startsWith(BEARER_PREFIX)) {
      return res.status(401).json({ error: 'Authorization header missing or malformed' });
    }

    const token = authorization.slice(BEARER_PREFIX.length);
    const decodedToken = await getAuth().verifyIdToken(token);

    authLog.debug('auth:verified', { uid: decodedToken.uid, email: decodedToken.email });
    req.firebaseUser = decodedToken;
    res.locals.firebaseUser = decodedToken;

    return next();
  } catch (error) {
    // Expected 401 path: expired / invalid / rejected token — a routine client condition, not a server error.
    authLog.info('auth:rejected', { reason: error instanceof Error ? error.message : String(error) });
    return res.status(401).json({ error: 'Unauthorized' });
  }
}

export default authenticateFirebase;
