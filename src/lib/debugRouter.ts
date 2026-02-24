/**
 * Debug Events Router
 *
 * Provides diagnostic endpoints for inspecting the server EventBus.
 * Only active when NODE_ENV=development.
 *
 * Endpoints:
 *   GET    /event-log   - Recent emitted events with listener counts
 *   DELETE /event-log   - Clear the event log
 *   GET    /listeners   - Registered listener counts per event
 *
 * @packageDocumentation
 */

import { Router } from 'express';
import { getServerEventBus } from './eventBus.js';

/**
 * Creates an Express router with debug endpoints for the server EventBus.
 * Returns a no-op router in production (no routes registered).
 */
export function debugEventsRouter(): Router {
  const router = Router();

  if (process.env.NODE_ENV !== 'development') {
    return router;
  }

  router.get('/event-log', (_req, res) => {
    const limit = parseInt(String(_req.query.limit) || '50', 10);
    const events = getServerEventBus().getRecentEvents(limit);
    res.json({ count: events.length, events });
  });

  router.delete('/event-log', (_req, res) => {
    getServerEventBus().clearEventLog();
    res.json({ cleared: true });
  });

  router.get('/listeners', (_req, res) => {
    const counts = getServerEventBus().getListenerCounts();
    const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
    res.json({ total, events: counts });
  });

  return router;
}
