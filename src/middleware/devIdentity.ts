import type { DecodedIdToken } from 'firebase-admin/auth';
import { decodeDevIdentityToken } from '@almadar/core';
import { env } from '../lib/env.js';

const BEARER_PREFIX = 'Bearer ';

/**
 * The fixed dev viewer, used when the bypass is on and no credential was sent.
 * It has no `role`, so it can only exercise the ungated path — a persona-gated
 * screen needs a real persona, which is what the token form below carries.
 */
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

/**
 * Resolve a dev-bypass identity from an Authorization header, or `undefined` when
 * the request must go through real token verification.
 *
 * Two accepted shapes, both gated on `ALLOW_DEV_AUTH_BYPASS` alone (never on
 * `NODE_ENV`, so a production deployment fails closed):
 *
 * 1. No/malformed credential → {@link DEV_USER}.
 * 2. A `Bearer <dev token>` minted by the shell's mocked sign-in → that persona,
 *    **including its `role`**. Real Firebase claims have no role field, so without
 *    this a signed-in user leaves every `@user.role` gate inert.
 *
 * Both Express (`authenticateFirebase`) and Hono (`@almadar/server-hono`) call
 * this; the shapes must not diverge between the two servers.
 */
export function resolveDevIdentity(
  authorization: string | undefined,
): DecodedIdToken | undefined {
  if (env.ALLOW_DEV_AUTH_BYPASS !== 'true') return undefined;

  if (!authorization || !authorization.startsWith(BEARER_PREFIX)) {
    return DEV_USER;
  }

  const persona = decodeDevIdentityToken(authorization.slice(BEARER_PREFIX.length));
  if (!persona) return undefined;

  return {
    ...DEV_USER,
    ...persona,
    uid: persona.id,
    sub: persona.id,
    email: typeof persona.email === 'string' ? persona.email : `${persona.id}@localhost`,
  };
}
