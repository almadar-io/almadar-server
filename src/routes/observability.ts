/**
 * Observability Routes
 *
 * Provides endpoints for metrics, health checks, and telemetry.
 *
 * @packageDocumentation
 */

import { Router } from 'express';

async function getObservabilityCollector() {
  const mod = await import('@almadar-io/agent');
  return mod.getObservabilityCollector();
}

const router: ReturnType<typeof Router> = Router();

/**
 * GET /metrics - Get performance snapshot
 */
router.get('/metrics', async (req, res) => {
  try {
    const collector = await getObservabilityCollector();
    const snapshot = collector.getPerformanceSnapshot();
    res.json(snapshot);
  } catch (error) {
    console.error('Metrics error:', error);
    res.status(500).json({ error: 'Failed to get metrics' });
  }
});

/**
 * GET /health - Get health check
 */
router.get('/health', async (req, res) => {
  try {
    const collector = await getObservabilityCollector();
    const health = await collector.healthCheck();
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
router.get('/sessions/:threadId/telemetry', async (req, res) => {
  try {
    const collector = await getObservabilityCollector();
    const telemetry = collector.getSessionTelemetry(req.params.threadId);

    if (!telemetry) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    res.json(telemetry);
  } catch (error) {
    console.error('Telemetry error:', error);
    res.status(500).json({ error: 'Failed to get telemetry' });
  }
});

/**
 * GET /active-sessions - Get active sessions
 */
router.get('/active-sessions', async (req, res) => {
  try {
    const collector = await getObservabilityCollector();
    const sessions = collector.getActiveSessions();
    res.json(sessions);
  } catch (error) {
    console.error('Active sessions error:', error);
    res.status(500).json({ error: 'Failed to get active sessions' });
  }
});

export default router;
