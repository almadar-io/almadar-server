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
 *   POST   /seed        - Seed MockDataService with entity data
 *
 * @packageDocumentation
 */

import { Router } from 'express';
import { getServerEventBus } from './eventBus.js';
import { seedMockData, type EntitySeedConfig } from '../services/DataService.js';
import type { FieldSchema } from '../services/MockDataService.js';

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

  /**
   * POST /seed - Seed MockDataService with entity data from schema.
   *
   * Body: { entities: Array<{ name: string, fields: FieldSchema[], seedCount?: number }> }
   *
   * Used by the orbital-state-viewer to populate mock data on connect.
   */
  router.post('/seed', (req, res) => {
    const { entities } = req.body as {
      entities?: Array<{ name: string; fields: FieldSchema[]; seedCount?: number }>;
    };

    if (!entities || !Array.isArray(entities)) {
      res.status(400).json({ error: 'Body must have "entities" array' });
      return;
    }

    const configs: EntitySeedConfig[] = entities.map((e) => ({
      name: e.name,
      fields: e.fields,
      seedCount: e.seedCount ?? 5,
    }));

    seedMockData(configs);

    const summary = configs.map((c) => `${c.name}(${c.seedCount})`).join(', ');
    res.json({ seeded: true, summary });
  });

  return router;
}
