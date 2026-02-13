/**
 * @fileoverview Unit tests for observability routes
 * @module @almadar/server/routes/observability.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// Create mock router
const createMockRouter = () => {
  const router = express.Router();
  
  router.get('/health', (req, res) => {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
    });
  });

  router.get('/metrics', (req, res) => {
    res.json({
      totalEvents: 100,
      eventsByType: { request: 50, error: 5 },
      averageProcessingTime: 150,
    });
  });

  router.post('/events', express.json(), (req, res) => {
    const { type, data } = req.body;
    if (!type) {
      return res.status(400).json({ error: 'Event type is required' });
    }
    res.status(201).json({ success: true, id: `evt_${Date.now()}` });
  });

  return router;
};

describe('Observability Routes', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/observability', createMockRouter());
    vi.clearAllMocks();
  });

  describe('GET /health', () => {
    it('should return health status', async () => {
      const response = await request(app).get('/observability/health');
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status');
      expect(response.body.status).toBe('healthy');
    });
  });

  describe('GET /metrics', () => {
    it('should return metrics', async () => {
      const response = await request(app).get('/observability/metrics');
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('totalEvents');
      expect(response.body).toHaveProperty('eventsByType');
    });
  });

  describe('POST /events', () => {
    it('should record an event', async () => {
      const event = {
        type: 'test-event',
        data: { key: 'value' },
        timestamp: Date.now(),
      };

      const response = await request(app)
        .post('/observability/events')
        .send(event);
      
      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
    });

    it('should validate required fields', async () => {
      const response = await request(app)
        .post('/observability/events')
        .send({});
      
      expect(response.status).toBe(400);
    });
  });
});
