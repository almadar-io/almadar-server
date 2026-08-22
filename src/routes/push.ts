/**
 * Push Routes (Express)
 *
 * Mount at `/api/push`. Also exports a root-scope handler for the shared
 * service worker — a service worker's maximum scope is its own directory, so
 * it MUST be served from `/almadar-push-sw.js`, never under `/api`.
 *
 * @packageDocumentation
 */

import { Router } from 'express';
import { vapidPublicKey, PUSH_SERVICE_WORKER_SOURCE } from '../lib/push.js';

const router: ReturnType<typeof Router> = Router();

/**
 * GET /vapid-public-key — the browser needs this to call
 * PushManager.subscribe. Public by design (it is the PUBLIC half of the VAPID
 * pair); 404 when push is not configured so the client fails honestly.
 */
router.get('/vapid-public-key', (_req, res) => {
  const publicKey = vapidPublicKey();
  if (!publicKey) {
    res.status(404).json({ error: 'Push is not configured (VAPID_PUBLIC_KEY unset)' });
    return;
  }
  res.json({ publicKey });
});

export { router as pushRouter };

/** Root-scope handler serving the shared push service worker. */
export function pushServiceWorkerHandler(
  _req: import('express').Request,
  res: import('express').Response,
): void {
  res.type('application/javascript').send(PUSH_SERVICE_WORKER_SOURCE);
}
