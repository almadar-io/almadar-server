import { NextFunction, Request, RequestHandler, Response } from 'express';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { getAuth } from '@almadar/integrations/firebase';
import { createLogger } from '@almadar/logger';
import { resolveDevIdentity } from './devIdentity.js';

const authLog = createLogger('almadar:server:auth');

const BEARER_PREFIX = 'Bearer ';

/** Returns the Identity Platform tenant whose users may call this request's app, or null when it has none. */
export type TenantOf = (req: Request) => string | null;

async function verify(token: string, tenant: string | null): Promise<DecodedIdToken> {
  if (tenant !== null) return getAuth().tenantManager().authForTenant(tenant).verifyIdToken(token);
  const decoded = await getAuth().verifyIdToken(token);
  // A tenant token is a valid token of the project too; it belongs to a published app's end user, never to these routes.
  if (decoded.firebase.tenant !== undefined) throw new Error(`token belongs to tenant ${decoded.firebase.tenant}`);
  return decoded;
}

/** Who a request's bearer is, or why it is refused. Shared by the Express and Hono middlewares. */
export type AuthOutcome = { ok: true; user: DecodedIdToken } | { ok: false; status: 401; error: string };

/**
 * Resolve a request's `Authorization` header: the dev-bypass identity when that is enabled, else a
 * verified Firebase ID token. `tenant` is the app's Identity Platform tenant (the token must be one of
 * its users), `null` for project-level routes (a tenant token is refused), or `undefined` when the
 * request belongs to an app with no sign-in tenant (always refused).
 */
export async function authenticateBearer(authorization: string | undefined, tenant: string | null | undefined): Promise<AuthOutcome> {
  const devUser = resolveDevIdentity(authorization);
  if (devUser) {
    authLog.debug('auth:devBypass', { uid: devUser.uid, role: devUser['role'] });
    return { ok: true, user: devUser };
  }
  if (!authorization || !authorization.startsWith(BEARER_PREFIX)) {
    return { ok: false, status: 401, error: 'Authorization header missing or malformed' };
  }
  if (tenant === undefined) return { ok: false, status: 401, error: 'This app has no sign-in tenant' };
  try {
    const user = await verify(authorization.slice(BEARER_PREFIX.length), tenant);
    authLog.debug('auth:verified', { uid: user.uid, email: user.email, ...(tenant ? { tenant } : {}) });
    return { ok: true, user };
  } catch (error) {
    // Expected 401 path: expired / invalid / rejected token — a routine client condition, not a server error.
    authLog.info('auth:rejected', { reason: error instanceof Error ? error.message : String(error), ...(tenant ? { tenant } : {}) });
    return { ok: false, status: 401, error: 'Unauthorized' };
  }
}

function firebaseAuth(tenantOf: TenantOf | null): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    const tenant = tenantOf ? (tenantOf(req) ?? undefined) : null;
    const outcome = await authenticateBearer(req.headers.authorization, tenant);
    if (!outcome.ok) return res.status(outcome.status).json({ error: outcome.error });
    req.firebaseUser = outcome.user;
    res.locals.firebaseUser = outcome.user;
    return next();
  };
}

/** Verifies project-level Firebase ID tokens (the Studio's own users); refuses a published app's tenant tokens. */
export const authenticateFirebase: RequestHandler = firebaseAuth(null);

/** Verifies ID tokens against the Identity Platform tenant of the app the request belongs to. */
export function authenticateFirebaseForTenant(tenantOf: TenantOf): RequestHandler {
  return firebaseAuth(tenantOf);
}

export default authenticateFirebase;
