/**
 * Personas Router — the app's dev persona roster, over HTTP.
 *
 * A generated app's dev sign-in needs to know who it can sign in AS. That used
 * to be a hardcoded four-row list exported from `@almadar/core`; personas are
 * now declared per app as the seeded rows of its `[identity]` entity, so the
 * roster has to come from the app itself.
 *
 * It is served from the LIVE seeded rows rather than re-derived, because the
 * three seeders mint three different id schemes (`Person-N` in the Rust roster,
 * `mock-people-N` here, `Person Id N` on the interpreter path). A persona whose
 * id is not literally one of these rows owns nothing, so every ownership-scoped
 * list renders empty — and a working filter and a broken one look identical.
 *
 * Twin of the interpreter path's `GET /personas`
 * (`@almadar-io/playground-runtime`), down to the response envelope, so both
 * execution paths speak one protocol.
 *
 * Endpoints:
 *   GET /personas - The app's identity rows as viewers
 *
 * @packageDocumentation
 */

import { Router } from 'express';
import { env } from './env.js';
import { getMockDataService } from '../services/MockDataService.js';

/**
 * Creates an Express router serving the app's persona roster.
 *
 * Returns a no-op router unless `ALLOW_DEV_AUTH_BYPASS` is on — the same switch
 * that makes a dev identity token trustworthy at all. This is a dev affordance
 * and must not exist in a real deployment, mirroring how `debugEventsRouter`
 * returns an empty router outside development.
 *
 * Mount it BEFORE the auth middleware: a pre-login persona picker cannot
 * present a token it does not have yet.
 */
export function personasRouter(): Router {
  const router = Router();

  if (env.ALLOW_DEV_AUTH_BYPASS !== 'true') {
    return router;
  }

  router.get('/personas', (_req, res) => {
    const personas = getMockDataService().getIdentityRoster();
    res.json({
      success: true,
      personas,
      source: personas.length > 0 ? 'identity-entity' : 'none',
    });
  });

  return router;
}
