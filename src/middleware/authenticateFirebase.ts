import { NextFunction, Request, RequestHandler, Response } from 'express';
import type { AuthOutcome, TokenVerifier } from '@almadar/auth';
import { apiKeyVerifier, authenticateBearer as verifyBearer, verifierFromEnv, withApiKeys, type ApiKeyRecord } from '@almadar/auth/server';

/** Returns the Identity Platform tenant whose users may call this request's app, or null when it has none. */
export type TenantOf = (req: Request) => string | null;

export type { AuthOutcome };

let appVerifier: TokenVerifier | null = null;
let apiKeyLookup: ((keyHash: string) => Promise<ApiKeyRecord | null>) | null = null;

/**
 * Accept the app's API keys (`sk_live_…` bearers) beside its sign-in tokens. The host supplies
 * where key hashes are stored; the salt is `ALMADAR_API_KEY_SALT`. Without a call, keys are refused.
 */
export function installApiKeyLookup(lookup: (keyHash: string) => Promise<ApiKeyRecord | null>): void {
  apiKeyLookup = lookup;
  appVerifier = null;
}

function buildVerifier(): TokenVerifier {
  const signIn = verifierFromEnv(process.env);
  if (apiKeyLookup === null) return signIn;
  const salt = process.env.ALMADAR_API_KEY_SALT ?? '';
  return withApiKeys(signIn, apiKeyVerifier({ salt, lookup: apiKeyLookup }));
}

/**
 * Resolve a request's `Authorization` header: a token verified by the app's declared provider
 * (`AUTH_PROVIDER`; in dev, the Auth emulator via `FIREBASE_AUTH_EMULATOR_HOST`). `tenant` is the app's sign-in
 * tenant (the token must be one of its users), `null` for project-level routes (a tenant token is
 * refused), or `undefined` when the request belongs to an app with no sign-in tenant (always refused).
 */
export async function authenticateBearer(authorization: string | undefined, tenant: string | null | undefined): Promise<AuthOutcome> {
  appVerifier ??= buildVerifier();
  return verifyBearer(appVerifier, authorization, tenant);
}

function bearerAuth(tenantOf: TenantOf | null): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    const tenant = tenantOf ? (tenantOf(req) ?? undefined) : null;
    const outcome = await authenticateBearer(req.headers.authorization, tenant);
    if (!outcome.ok) return res.status(outcome.status).json({ error: outcome.error });
    req.authUser = outcome.user;
    res.locals.authUser = outcome.user;
    return next();
  };
}

/** Verifies project-level ID tokens (the Studio's own users); refuses a published app's tenant tokens. */
export const authenticateFirebase: RequestHandler = bearerAuth(null);

/** Verifies ID tokens against the sign-in tenant of the app the request belongs to. */
export function authenticateFirebaseForTenant(tenantOf: TenantOf): RequestHandler {
  return bearerAuth(tenantOf);
}

/**
 * For routes open to anonymous visitors: a request with no `Authorization` header goes on with no
 * `authUser` (anonymous); one that carries a credential must verify, or it is refused.
 */
export const identifyBearer: RequestHandler = async (req: Request, res: Response, next: NextFunction) => {
  const authorization = req.headers.authorization;
  if (authorization === undefined) return next();
  const outcome = await authenticateBearer(authorization, null);
  if (!outcome.ok) return res.status(outcome.status).json({ error: outcome.error });
  req.authUser = outcome.user;
  res.locals.authUser = outcome.user;
  return next();
};

export default authenticateFirebase;
