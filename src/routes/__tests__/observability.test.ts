/**
 * @fileoverview Unit tests for observability routes
 * @module @almadar/server/routes/observability.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { observabilityRouter } from '../observability';

// Mock @almadar/agent
vi.mock('@almadar/agent', () => ({
  getObservabilityCollector: vi.fn(() => ({
    recordEvent: vi.fn(),
    getMetrics: vi.fn(() => ({
      totalEvents: 100,
      eventsByType: { request: 50, error: 5 },
      averageProcessingTime: 150,
    })),
    healthCheck: vi.fn(() => ({
      status: 'healthy',
      checks: {
        database: 'connected',
        memory: 'ok',
      },
    })),
  })),
}));

describe('Observability Routes', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/observability', observabilityRouter);
    vi.clearAllMocks();
  });

  describe('GET /health', () => {
    it('should return health status', async () => {
      const response = await request(app).get('/observability/health');
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('checks');
    });
  });

  describe('GET /metrics', () => {
    it('should return metrics', async () => {
      const response = await request(app).get('/observability/metrics');
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('totalEvents');
      expect(response.body).toHaveProperty('eventsByType');
      expect(response.body).toHaveProperty('averageProcessingTime');
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
      expect(response.body).toEqual({ success: true });
    });

    it('should validate required fields', async () => {
      const response = await request(app)
        .post('/observability/events')
        .send({});
      
      expect(response.status).toBe(400);
    });
  });
});
