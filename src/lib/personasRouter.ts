/**
 * Personas Router — a generated app's dev persona roster, signed in through the Auth emulator.
 *
 * Personas are the rows of the app's `[identity]` entity. In dev each one is a user of the Auth
 * emulator (`@almadar/auth/server` `emulatedUser`: uid = row id, the row's fields as claims), so
 * signing in as a persona yields a real ID token and `@user` resolves exactly as in production.
 *
 * Endpoints (mounted only while `FIREBASE_AUTH_EMULATOR_HOST` is set; a deployment has none):
 *   GET  /personas          the roster
 *   POST /personas/sign-in  { id } → { customToken, authEmulatorHost, projectId }
 *
 * Twin of the interpreter path's `/persona` sign-in (`@almadar-io/playground-runtime`).
 *
 * @packageDocumentation
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import type { UserContext } from '@almadar/core';
import { emulatedUser } from '@almadar/auth/server';

/** The app's identity rows as viewers; the generated `identityRoster()` reads them from its data service. */
export type IdentityRoster = () => Promise<UserContext[]>;

const SignInBodySchema = z.object({ id: z.string().min(1) });

export function personasRouter(roster: IdentityRoster): Router {
  const router = Router();
  const authEmulatorHost = process.env['FIREBASE_AUTH_EMULATOR_HOST'];
  const projectId = process.env['FIREBASE_PROJECT_ID'];
  if (!authEmulatorHost || !projectId) return router;

  router.get('/personas', async (_req: Request, res: Response) => {
    try {
      const personas = await roster();
      res.json({ success: true, personas, source: personas.length > 0 ? 'identity-entity' : 'none' });
    } catch (error) {
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : String(error) });
    }
  });

  router.post('/personas/sign-in', async (req: Request, res: Response) => {
    const body = SignInBodySchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ success: false, error: 'expected { id }' });
      return;
    }
    try {
      const persona = (await roster()).find((p) => p.id === body.data.id);
      if (!persona) {
        res.status(404).json({ success: false, error: `no persona with id ${body.data.id}` });
        return;
      }
      const { customToken } = await emulatedUser(persona, process.env);
      res.json({ success: true, customToken, authEmulatorHost, projectId });
    } catch (error) {
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : String(error) });
    }
  });

  return router;
}
