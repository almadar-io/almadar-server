import type { DecodedIdToken } from 'firebase-admin/auth';
import { decodeDevIdentityToken, resolveDefaultViewer } from '@almadar/core';
import { env } from '../lib/env.js';
import { getMockDataService } from '../services/MockDataService.js';

const BEARER_PREFIX = 'Bearer ';

/**
 * The fixed dev viewer, used when the bypass is on, no credential was sent,
 * AND the app declares no `[identity]` roster. It has no `role`, so it can
 * only exercise the ungated path — a persona-gated screen needs a real
 * persona (the token form below, or the roster default resolved in
 * {@link defaultRosterIdentity}).
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
/**
 * The credential-less dev viewer. When the app declares an `[identity]`
 * roster, the anonymous viewer IS the roster's default member
 * (`resolveDefaultViewer` — the interpreter/playground path already behaves
 * this way): a roleless synthetic viewer makes every row-ACL'd list render
 * empty, indistinguishable on screen from broken mock seeding. Bare
 * {@link DEV_USER} remains the documented fallback for apps with no roster
 * (and when mock data is off, where the roster is necessarily empty).
 */
function defaultRosterIdentity(): DecodedIdToken {
  try {
    const roster = getMockDataService().getIdentityRoster();
    if (roster.length === 0) return DEV_USER;
    const viewer = resolveDefaultViewer(roster);
    return {
      ...DEV_USER,
      ...viewer,
      uid: viewer.id,
      sub: viewer.id,
      email:
        typeof viewer.email === 'string' && viewer.email !== ''
          ? viewer.email
          : `${viewer.id}@localhost`,
    };
  } catch {
    return DEV_USER;
  }
}

export function resolveDevIdentity(
  authorization: string | undefined,
): DecodedIdToken | undefined {
  if (env.ALLOW_DEV_AUTH_BYPASS !== 'true') return undefined;

  if (!authorization || !authorization.startsWith(BEARER_PREFIX)) {
    return defaultRosterIdentity();
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
