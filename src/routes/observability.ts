/**
 * Observability Routes
 *
 * Provides endpoints for metrics, health checks, and telemetry.
 * The DeepAgent observability collector dependency has been removed;
 * these endpoints now return server-native metrics.
 *
 * @packageDocumentation
 */

import { Router } from 'express';

const router: ReturnType<typeof Router> = Router();

// Defense-in-depth: these endpoints expose telemetry/metrics/session data, so they
// require an authenticated principal regardless of how the router is mounted.
router.use((req, res, next) => {
  if (!req.firebaseUser) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
});

/**
 * GET /metrics - Get performance snapshot
 */
router.get('/metrics', async (_req, res) => {
  try {
    const snapshot = {
      uptime: process.uptime(),
      requestCount: 0, // Would be tracked by middleware in production
      memory: process.memoryUsage(),
      timestamp: Date.now(),
    };
    res.json(snapshot);
  } catch (error) {
    console.error('Metrics error:', error);
    res.status(500).json({ error: 'Failed to get metrics' });
  }
});

/**
 * GET /health - Get health check
 */
router.get('/health', async (_req, res) => {
  try {
    const health = [{ status: 'healthy', name: 'server', timestamp: Date.now() }];
    const allHealthy = health.every((h) => h.status === 'healthy');

    res.status(allHealthy ? 200 : 503).json({
      status: allHealthy ? 'healthy' : 'degraded',
      timestamp: Date.now(),
      checks: health,
    });
  } catch (error) {
    console.error('Health check error:', error);
    res.status(500).json({
      status: 'unhealthy',
      error: 'Health check failed',
    });
  }
});

/**
 * GET /sessions/:threadId/telemetry - Get session telemetry
 */
router.get('/sessions/:threadId/telemetry', async (_req, res) => {
  res.status(501).json({
    error: 'Session telemetry is deprecated. Use @almadar-io/rabit trace events instead.',
  });
});

/**
 * GET /active-sessions - Get active sessions
 */
router.get('/active-sessions', async (_req, res) => {
  res.status(501).json({
    error: 'Active sessions tracking is deprecated. Use @almadar-io/rabit SessionStore instead.',
  });
});

export default router;
