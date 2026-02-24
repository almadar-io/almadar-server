import { z, ZodError } from 'zod';
import dotenv from 'dotenv';
import { Router } from 'express';
import admin from 'firebase-admin';
export { default as admin } from 'firebase-admin';
import { WebSocketServer, WebSocket } from 'ws';
import { faker } from '@faker-js/faker';
import { diffSchemas, categorizeRemovals, detectPageContentReduction, isDestructiveChange, hasSignificantPageReduction, requiresConfirmation } from '@almadar/core';
import { getObservabilityCollector, MemoryManager, SessionManager, getMultiUserManager, createWorkflowToolWrapper, createSkillAgent, createUserContext, getStateSyncManager } from '@almadar/agent';

var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
dotenv.config();
var envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.string().default("3030").transform((val) => parseInt(val, 10)),
  CORS_ORIGIN: z.string().default("http://localhost:5173").transform((val) => val.includes(",") ? val.split(",").map((s) => s.trim()) : val),
  // Database (Prisma/SQL) - optional
  DATABASE_URL: z.string().optional(),
  // Firebase/Firestore configuration
  FIREBASE_PROJECT_ID: z.string().optional(),
  FIREBASE_CLIENT_EMAIL: z.string().optional(),
  FIREBASE_PRIVATE_KEY: z.string().optional(),
  FIREBASE_SERVICE_ACCOUNT_PATH: z.string().optional(),
  FIRESTORE_EMULATOR_HOST: z.string().optional(),
  FIREBASE_AUTH_EMULATOR_HOST: z.string().optional(),
  // API configuration
  API_PREFIX: z.string().default("/api"),
  // Mock data configuration
  USE_MOCK_DATA: z.string().default("true").transform((v) => v === "true"),
  MOCK_SEED: z.string().optional().transform((v) => v ? parseInt(v, 10) : void 0)
});
var parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("\u274C Invalid environment variables:", parsed.error.flatten().fieldErrors);
  throw new Error("Invalid environment variables");
}
var env = parsed.data;

// src/lib/logger.ts
var colors = {
  debug: "\x1B[36m",
  // Cyan
  info: "\x1B[32m",
  // Green
  warn: "\x1B[33m",
  // Yellow
  error: "\x1B[31m",
  // Red
  reset: "\x1B[0m"
};
var shouldLog = (level) => {
  const levels = ["debug", "info", "warn", "error"];
  const minLevel = env.NODE_ENV === "production" ? "info" : "debug";
  return levels.indexOf(level) >= levels.indexOf(minLevel);
};
var formatMessage = (level, message, meta) => {
  const timestamp = (/* @__PURE__ */ new Date()).toISOString();
  const color = colors[level];
  const prefix = `${color}[${level.toUpperCase()}]${colors.reset}`;
  const metaStr = meta ? ` ${JSON.stringify(meta)}` : "";
  return `${timestamp} ${prefix} ${message}${metaStr}`;
};
var logger = {
  debug: (message, meta) => {
    if (shouldLog("debug")) {
      console.log(formatMessage("debug", message, meta));
    }
  },
  info: (message, meta) => {
    if (shouldLog("info")) {
      console.log(formatMessage("info", message, meta));
    }
  },
  warn: (message, meta) => {
    if (shouldLog("warn")) {
      console.warn(formatMessage("warn", message, meta));
    }
  },
  error: (message, meta) => {
    if (shouldLog("error")) {
      console.error(formatMessage("error", message, meta));
    }
  }
};

// src/lib/eventBus.ts
var MAX_EVENT_LOG = 200;
var EventBus = class {
  handlers = /* @__PURE__ */ new Map();
  debug;
  eventLog = [];
  constructor(options) {
    this.debug = options?.debug ?? false;
  }
  on(event, handler) {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, /* @__PURE__ */ new Set());
    }
    this.handlers.get(event).add(handler);
    return () => {
      this.handlers.get(event)?.delete(handler);
    };
  }
  off(event, handler) {
    this.handlers.get(event)?.delete(handler);
  }
  emit(event, payload, meta) {
    if (this.debug) {
      console.log(`[EventBus] Emitting ${event}:`, payload);
    }
    const handlers = this.handlers.get(event);
    const listenerCount = handlers?.size ?? 0;
    if (handlers) {
      handlers.forEach((handler) => {
        try {
          handler(payload, meta);
        } catch (err) {
          console.error(`[EventBus] Error in handler for ${event}:`, err);
        }
      });
    }
    let wildcardListenerCount = 0;
    if (event !== "*") {
      const wildcardHandlers = this.handlers.get("*");
      wildcardListenerCount = wildcardHandlers?.size ?? 0;
      if (wildcardHandlers) {
        wildcardHandlers.forEach((handler) => {
          try {
            handler({ type: event, payload, timestamp: Date.now() }, meta);
          } catch (err) {
            console.error(`[EventBus] Error in wildcard handler for ${event}:`, err);
          }
        });
      }
    }
    if (this.debug) {
      this.eventLog.push({
        event,
        payload,
        timestamp: Date.now(),
        listenerCount,
        wildcardListenerCount
      });
      if (this.eventLog.length > MAX_EVENT_LOG) {
        this.eventLog.splice(0, this.eventLog.length - MAX_EVENT_LOG);
      }
    }
  }
  getRecentEvents(limit = 50) {
    return this.eventLog.slice(-limit);
  }
  clearEventLog() {
    this.eventLog.length = 0;
  }
  getListenerCounts() {
    const counts = {};
    this.handlers.forEach((handlers, event) => {
      counts[event] = handlers.size;
    });
    return counts;
  }
  clear() {
    this.handlers.clear();
    this.eventLog.length = 0;
  }
};
var _serverEventBus = null;
function getServerEventBus() {
  if (!_serverEventBus) {
    _serverEventBus = new EventBus({
      debug: process.env.NODE_ENV === "development"
    });
  }
  return _serverEventBus;
}
function resetServerEventBus() {
  _serverEventBus?.clear();
  _serverEventBus = null;
}
function emitEntityEvent(entityType, action, payload) {
  const eventType = `${entityType.toUpperCase()}_${action}`;
  getServerEventBus().emit(eventType, payload, { orbital: entityType });
}

// src/lib/eventBusTransport.ts
var InMemoryTransport = class {
  async publish() {
  }
  async subscribe() {
  }
  async close() {
  }
};
var RedisTransport = class {
  channel;
  publishFn;
  subscribeFn;
  closeFn;
  constructor(options) {
    this.channel = options.channel ?? "almadar:events";
    this.publishFn = options.publishFn;
    this.subscribeFn = options.subscribeFn;
    this.closeFn = options.closeFn;
  }
  async publish(message) {
    const serialized = JSON.stringify(message);
    await this.publishFn(this.channel, serialized);
  }
  async subscribe(receiver) {
    await this.subscribeFn(this.channel, (raw) => {
      try {
        const message = JSON.parse(raw);
        receiver(message);
      } catch {
        console.error("[RedisTransport] Failed to parse message:", raw);
      }
    });
  }
  async close() {
    if (this.closeFn) {
      await this.closeFn();
    }
  }
};
var instanceCounter = 0;
var DistributedEventBus = class {
  localBus;
  transport;
  instanceId;
  isRelaying = false;
  constructor(options) {
    this.localBus = new EventBus({ debug: options?.debug });
    this.transport = options?.transport ?? new InMemoryTransport();
    this.instanceId = `instance_${++instanceCounter}_${Date.now()}`;
  }
  /**
   * Initialize the transport subscription. Call once at startup.
   */
  async connect() {
    await this.transport.subscribe((message) => {
      if (message.sourceId === this.instanceId) {
        return;
      }
      this.isRelaying = true;
      try {
        this.localBus.emit(message.event, message.payload, message.meta);
      } finally {
        this.isRelaying = false;
      }
    });
  }
  /**
   * Emit an event locally and publish to transport for other processes.
   */
  emit(event, payload, meta) {
    this.localBus.emit(event, payload, meta);
    if (!this.isRelaying) {
      const message = {
        event,
        payload,
        meta,
        sourceId: this.instanceId,
        timestamp: Date.now()
      };
      this.transport.publish(message).catch((err) => {
        console.error("[DistributedEventBus] Transport publish error:", err);
      });
    }
  }
  /** Subscribe to an event */
  on(event, handler) {
    return this.localBus.on(event, handler);
  }
  /** Unsubscribe from an event */
  off(event, handler) {
    this.localBus.off(event, handler);
  }
  /** Get recent events (dev diagnostics) */
  getRecentEvents(limit) {
    return this.localBus.getRecentEvents(limit);
  }
  /** Clear event log */
  clearEventLog() {
    this.localBus.clearEventLog();
  }
  /** Get listener counts */
  getListenerCounts() {
    return this.localBus.getListenerCounts();
  }
  /** Clear all listeners and log */
  clear() {
    this.localBus.clear();
  }
  /** Disconnect transport */
  async disconnect() {
    await this.transport.close();
  }
  /** Get the instance ID (for debugging) */
  getInstanceId() {
    return this.instanceId;
  }
};

// src/lib/eventPersistence.ts
var InMemoryEventStore = class {
  events = [];
  index = /* @__PURE__ */ new Map();
  async store(event) {
    this.events.push(event);
    this.index.set(event.id, event);
  }
  async query(filters) {
    let results = this.events;
    if (filters.eventName) {
      results = results.filter((e) => e.eventName === filters.eventName);
    }
    if (filters.source) {
      results = results.filter((e) => e.source === filters.source);
    }
    if (filters.traceId) {
      results = results.filter((e) => e.traceId === filters.traceId);
    }
    if (filters.after !== void 0) {
      results = results.filter((e) => e.timestamp > filters.after);
    }
    if (filters.before !== void 0) {
      results = results.filter((e) => e.timestamp < filters.before);
    }
    if (filters.order === "desc") {
      results = [...results].reverse();
    }
    if (filters.limit !== void 0 && filters.limit > 0) {
      results = results.slice(0, filters.limit);
    }
    return results;
  }
  async get(id) {
    return this.index.get(id) ?? null;
  }
  async deleteOlderThan(timestamp) {
    const before = this.events.length;
    this.events = this.events.filter((e) => e.timestamp >= timestamp);
    this.index.clear();
    for (const event of this.events) {
      this.index.set(event.id, event);
    }
    return before - this.events.length;
  }
  async count() {
    return this.events.length;
  }
  async clear() {
    this.events = [];
    this.index.clear();
  }
};
var idCounter = 0;
var EventPersistence = class {
  store;
  options;
  cleanupTimer = null;
  constructor(options, store) {
    this.options = {
      enabled: options?.enabled ?? true,
      retentionMs: options?.retentionMs ?? 24 * 60 * 60 * 1e3,
      // 24 hours
      maxEvents: options?.maxEvents ?? 1e4,
      cleanupIntervalMs: options?.cleanupIntervalMs ?? 5 * 60 * 1e3,
      // 5 minutes
      defaultSource: options?.defaultSource ?? "unknown"
    };
    this.store = store ?? new InMemoryEventStore();
  }
  /**
   * Persist an event.
   */
  async persist(eventName, payload, meta) {
    const event = {
      id: `evt_${++idCounter}_${Date.now()}`,
      eventName,
      payload,
      source: meta?.source ?? this.options.defaultSource,
      timestamp: Date.now(),
      traceId: meta?.traceId ?? `trace_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      meta: meta ? { ...meta } : void 0
    };
    if (this.options.enabled) {
      await this.store.store(event);
    }
    return event;
  }
  /**
   * Replay events matching the query filters.
   */
  async replay(query) {
    return this.store.query(query);
  }
  /**
   * Get a single event by ID.
   */
  async getEvent(id) {
    return this.store.get(id);
  }
  /**
   * Get event count.
   */
  async getEventCount() {
    return this.store.count();
  }
  /**
   * Run cleanup — delete events older than retention period.
   */
  async cleanup() {
    const cutoff = Date.now() - this.options.retentionMs;
    return this.store.deleteOlderThan(cutoff);
  }
  /**
   * Start periodic cleanup timer.
   */
  startCleanup() {
    if (this.cleanupTimer) return;
    this.cleanupTimer = setInterval(() => {
      this.cleanup().catch((err) => {
        console.error("[EventPersistence] Cleanup error:", err);
      });
    }, this.options.cleanupIntervalMs);
  }
  /**
   * Stop periodic cleanup timer.
   */
  stopCleanup() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }
  /**
   * Clear all persisted events.
   */
  async clear() {
    await this.store.clear();
  }
  /**
   * Get the underlying store (for testing or custom queries).
   */
  getStore() {
    return this.store;
  }
};
function debugEventsRouter() {
  const router2 = Router();
  if (process.env.NODE_ENV !== "development") {
    return router2;
  }
  router2.get("/event-log", (_req, res) => {
    const limit = parseInt(String(_req.query.limit) || "50", 10);
    const events = getServerEventBus().getRecentEvents(limit);
    res.json({ count: events.length, events });
  });
  router2.delete("/event-log", (_req, res) => {
    getServerEventBus().clearEventLog();
    res.json({ cleared: true });
  });
  router2.get("/listeners", (_req, res) => {
    const counts = getServerEventBus().getListenerCounts();
    const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
    res.json({ total, events: counts });
  });
  return router2;
}
function initializeFirebase() {
  if (admin.apps.length > 0) {
    return admin.app();
  }
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
  if (emulatorHost) {
    const app = admin.initializeApp({
      projectId: projectId || "demo-project"
    });
    console.log(`Firebase Admin initialized for emulator: ${emulatorHost}`);
    return app;
  }
  const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (serviceAccountPath) {
    const serviceAccount = __require(serviceAccountPath);
    return admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId
    });
  }
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;
  if (projectId && clientEmail && privateKey) {
    return admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey: privateKey.replace(/\\n/g, "\n")
      }),
      projectId
    });
  }
  if (projectId) {
    return admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      projectId
    });
  }
  throw new Error(
    "@almadar/server: Cannot initialize Firebase \u2014 no credentials found. Set FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY, or FIREBASE_SERVICE_ACCOUNT_PATH, or FIRESTORE_EMULATOR_HOST."
  );
}
function getApp() {
  if (admin.apps.length === 0) {
    throw new Error(
      "@almadar/server: Firebase Admin SDK is not initialized. Call initializeFirebase() or admin.initializeApp() before using @almadar/server."
    );
  }
  return admin.app();
}
function getFirestore() {
  return getApp().firestore();
}
function getAuth() {
  return getApp().auth();
}
var db = new Proxy({}, {
  get(_target, prop, receiver) {
    const firestore = getFirestore();
    const value = Reflect.get(firestore, prop, receiver);
    return typeof value === "function" ? value.bind(firestore) : value;
  }
});
var wss = null;
function setupEventBroadcast(server, path = "/ws/events") {
  if (wss) {
    logger.warn("[WebSocket] Server already initialized");
    return wss;
  }
  wss = new WebSocketServer({ server, path });
  logger.info(`[WebSocket] Server listening at ${path}`);
  wss.on("connection", (ws, req) => {
    const clientId = req.headers["sec-websocket-key"] || "unknown";
    logger.debug(`[WebSocket] Client connected: ${clientId}`);
    ws.send(
      JSON.stringify({
        type: "CONNECTED",
        timestamp: Date.now(),
        message: "Connected to event stream"
      })
    );
    ws.on("message", (data) => {
      try {
        const message = JSON.parse(data.toString());
        logger.debug(`[WebSocket] Received from ${clientId}:`, message);
        if (message.type && message.payload) {
          getServerEventBus().emit(message.type, message.payload, {
            orbital: "client",
            entity: clientId
          });
        }
      } catch (error) {
        logger.error(`[WebSocket] Failed to parse message:`, error);
      }
    });
    ws.on("close", () => {
      logger.debug(`[WebSocket] Client disconnected: ${clientId}`);
    });
    ws.on("error", (error) => {
      logger.error(`[WebSocket] Client error:`, error);
    });
  });
  getServerEventBus().on("*", (event) => {
    if (!wss) return;
    const typedEvent = event;
    const message = JSON.stringify({
      type: typedEvent.type,
      payload: typedEvent.payload,
      timestamp: typedEvent.timestamp,
      source: typedEvent.source
    });
    let broadcastCount = 0;
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
        broadcastCount++;
      }
    });
    if (broadcastCount > 0) {
      logger.debug(`[WebSocket] Broadcast ${typedEvent.type} to ${broadcastCount} client(s)`);
    }
  });
  return wss;
}
function getWebSocketServer() {
  return wss;
}
function closeWebSocketServer() {
  return new Promise((resolve, reject) => {
    if (!wss) {
      resolve();
      return;
    }
    wss.close((err) => {
      if (err) {
        reject(err);
      } else {
        wss = null;
        resolve();
      }
    });
  });
}
function getConnectedClientCount() {
  if (!wss) return 0;
  return wss.clients.size;
}
var AppError = class extends Error {
  constructor(statusCode, message, code) {
    super(message);
    this.statusCode = statusCode;
    this.message = message;
    this.code = code;
    this.name = "AppError";
  }
};
var NotFoundError = class extends AppError {
  constructor(message = "Resource not found") {
    super(404, message, "NOT_FOUND");
  }
};
var ValidationError = class extends AppError {
  constructor(message = "Validation failed") {
    super(400, message, "VALIDATION_ERROR");
  }
};
var UnauthorizedError = class extends AppError {
  constructor(message = "Unauthorized") {
    super(401, message, "UNAUTHORIZED");
  }
};
var ForbiddenError = class extends AppError {
  constructor(message = "Forbidden") {
    super(403, message, "FORBIDDEN");
  }
};
var ConflictError = class extends AppError {
  constructor(message = "Resource conflict") {
    super(409, message, "CONFLICT");
  }
};
var errorHandler = (err, _req, res, _next) => {
  logger.error("Error:", { name: err.name, message: err.message, stack: err.stack });
  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      error: "Validation failed",
      code: "VALIDATION_ERROR",
      details: err.errors.map((e) => ({
        path: e.path.join("."),
        message: e.message
      }))
    });
    return;
  }
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      error: err.message,
      code: err.code
    });
    return;
  }
  if (err.name === "FirebaseError" || err.name === "FirestoreError") {
    res.status(500).json({
      success: false,
      error: "Database error",
      code: "DATABASE_ERROR"
    });
    return;
  }
  res.status(500).json({
    success: false,
    error: "Internal server error",
    code: "INTERNAL_ERROR"
  });
};
var asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};
var notFoundHandler = (req, res) => {
  res.status(404).json({
    success: false,
    error: `Route ${req.method} ${req.path} not found`,
    code: "ROUTE_NOT_FOUND"
  });
};
var validateBody = (schema) => async (req, res, next) => {
  try {
    req.body = await schema.parseAsync(req.body);
    next();
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json({
        success: false,
        error: "Validation failed",
        code: "VALIDATION_ERROR",
        details: error.errors.map((e) => ({
          path: e.path.join("."),
          message: e.message
        }))
      });
      return;
    }
    next(error);
  }
};
var validateQuery = (schema) => async (req, res, next) => {
  try {
    req.query = await schema.parseAsync(req.query);
    next();
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json({
        success: false,
        error: "Invalid query parameters",
        code: "VALIDATION_ERROR",
        details: error.errors.map((e) => ({
          path: e.path.join("."),
          message: e.message
        }))
      });
      return;
    }
    next(error);
  }
};
var validateParams = (schema) => async (req, res, next) => {
  try {
    req.params = await schema.parseAsync(req.params);
    next();
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json({
        success: false,
        error: "Invalid path parameters",
        code: "VALIDATION_ERROR",
        details: error.errors.map((e) => ({
          path: e.path.join("."),
          message: e.message
        }))
      });
      return;
    }
    next(error);
  }
};

// src/middleware/authenticateFirebase.ts
var BEARER_PREFIX = "Bearer ";
var DEV_USER = {
  uid: "dev-user-001",
  email: "dev@localhost",
  email_verified: true,
  aud: "dev-project",
  auth_time: Math.floor(Date.now() / 1e3),
  exp: Math.floor(Date.now() / 1e3) + 3600,
  iat: Math.floor(Date.now() / 1e3),
  iss: "https://securetoken.google.com/dev-project",
  sub: "dev-user-001",
  firebase: {
    identities: {},
    sign_in_provider: "custom"
  }
};
async function authenticateFirebase(req, res, next) {
  const authorization = req.headers.authorization;
  if (env.NODE_ENV === "development" && (!authorization || !authorization.startsWith(BEARER_PREFIX))) {
    req.firebaseUser = DEV_USER;
    res.locals.firebaseUser = DEV_USER;
    return next();
  }
  try {
    if (!authorization || !authorization.startsWith(BEARER_PREFIX)) {
      return res.status(401).json({ error: "Authorization header missing or malformed" });
    }
    const token = authorization.slice(BEARER_PREFIX.length);
    const decodedToken = await getAuth().verifyIdToken(token);
    req.firebaseUser = decodedToken;
    res.locals.firebaseUser = decodedToken;
    return next();
  } catch (error) {
    console.error("Firebase authentication failed:", error);
    return res.status(401).json({ error: "Unauthorized" });
  }
}
var MockDataService = class {
  stores = /* @__PURE__ */ new Map();
  schemas = /* @__PURE__ */ new Map();
  idCounters = /* @__PURE__ */ new Map();
  constructor() {
    if (env.MOCK_SEED !== void 0) {
      faker.seed(env.MOCK_SEED);
      logger.info(`[Mock] Using seed: ${env.MOCK_SEED}`);
    }
  }
  // ============================================================================
  // Store Management
  // ============================================================================
  /**
   * Initialize store for an entity.
   */
  getStore(entityName) {
    const normalized = entityName.toLowerCase();
    if (!this.stores.has(normalized)) {
      this.stores.set(normalized, /* @__PURE__ */ new Map());
      this.idCounters.set(normalized, 0);
    }
    return this.stores.get(normalized);
  }
  /**
   * Generate next ID for an entity.
   */
  nextId(entityName) {
    const normalized = entityName.toLowerCase();
    const counter = (this.idCounters.get(normalized) ?? 0) + 1;
    this.idCounters.set(normalized, counter);
    return `mock-${normalized}-${counter}`;
  }
  // ============================================================================
  // Schema & Seeding
  // ============================================================================
  /**
   * Register an entity schema.
   */
  registerSchema(entityName, schema) {
    this.schemas.set(entityName.toLowerCase(), schema);
  }
  /**
   * Seed an entity with mock data.
   */
  seed(entityName, fields, count = 10) {
    const store = this.getStore(entityName);
    const normalized = entityName.toLowerCase();
    logger.info(`[Mock] Seeding ${count} ${entityName}...`);
    for (let i = 0; i < count; i++) {
      const item = this.generateMockItem(normalized, fields, i + 1);
      store.set(item.id, item);
    }
  }
  /**
   * Generate a single mock item based on field schemas.
   */
  generateMockItem(entityName, fields, index) {
    const id = this.nextId(entityName);
    const now = /* @__PURE__ */ new Date();
    const item = {
      id,
      createdAt: faker.date.past({ years: 1 }),
      updatedAt: now
    };
    for (const field of fields) {
      if (field.name === "id" || field.name === "createdAt" || field.name === "updatedAt") {
        continue;
      }
      item[field.name] = this.generateFieldValue(entityName, field, index);
    }
    return item;
  }
  /**
   * Generate a mock value for a field based on its schema.
   */
  generateFieldValue(entityName, field, index) {
    if (!field.required && Math.random() > 0.8) {
      return void 0;
    }
    switch (field.type) {
      case "string":
        return this.generateStringValue(entityName, field, index);
      case "number":
        return faker.number.int({
          min: field.min ?? 0,
          max: field.max ?? 1e3
        });
      case "boolean":
        return faker.datatype.boolean();
      case "date":
        return this.generateDateValue(field);
      case "enum":
        if (field.enumValues && field.enumValues.length > 0) {
          return faker.helpers.arrayElement(field.enumValues);
        }
        return null;
      case "relation":
        if (field.relatedEntity) {
          const relatedStore = this.stores.get(field.relatedEntity.toLowerCase());
          if (relatedStore && relatedStore.size > 0) {
            const ids = Array.from(relatedStore.keys());
            return faker.helpers.arrayElement(ids);
          }
        }
        return null;
      case "array":
        return [];
      default:
        return null;
    }
  }
  /**
   * Generate a string value based on field name heuristics.
   * Generic name/title fields use entity-aware format (e.g., "Project Name 1").
   * Specific fields (email, phone, etc.) use faker.
   */
  generateStringValue(entityName, field, index) {
    const name = field.name.toLowerCase();
    if (field.enumValues && field.enumValues.length > 0) {
      return faker.helpers.arrayElement(field.enumValues);
    }
    if (name.includes("email")) return faker.internet.email();
    if (name.includes("phone")) return faker.phone.number();
    if (name.includes("address")) return faker.location.streetAddress();
    if (name.includes("city")) return faker.location.city();
    if (name.includes("country")) return faker.location.country();
    if (name.includes("url") || name.includes("website")) return faker.internet.url();
    if (name.includes("avatar") || name.includes("image")) return faker.image.avatar();
    if (name.includes("color")) return faker.color.human();
    if (name.includes("uuid")) return faker.string.uuid();
    const entityLabel = this.capitalizeFirst(entityName);
    const fieldLabel = this.capitalizeFirst(field.name);
    return `${entityLabel} ${fieldLabel} ${index}`;
  }
  /**
   * Capitalize first letter of a string.
   */
  capitalizeFirst(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
  /**
   * Generate a date value based on field name heuristics.
   */
  generateDateValue(field) {
    const name = field.name.toLowerCase();
    if (name.includes("created") || name.includes("start") || name.includes("birth")) {
      return faker.date.past({ years: 2 });
    }
    if (name.includes("updated") || name.includes("modified")) {
      return faker.date.recent({ days: 30 });
    }
    if (name.includes("deadline") || name.includes("due") || name.includes("end") || name.includes("expires")) {
      return faker.date.future({ years: 1 });
    }
    return faker.date.anytime();
  }
  // ============================================================================
  // CRUD Operations
  // ============================================================================
  /**
   * List all items of an entity.
   */
  list(entityName) {
    const store = this.getStore(entityName);
    return Array.from(store.values());
  }
  /**
   * Get a single item by ID.
   */
  getById(entityName, id) {
    const store = this.getStore(entityName);
    const item = store.get(id);
    return item ?? null;
  }
  /**
   * Create a new item.
   */
  create(entityName, data) {
    const store = this.getStore(entityName);
    const id = this.nextId(entityName);
    const now = /* @__PURE__ */ new Date();
    const item = {
      ...data,
      id,
      createdAt: now,
      updatedAt: now
    };
    store.set(id, item);
    return item;
  }
  /**
   * Update an existing item.
   */
  update(entityName, id, data) {
    const store = this.getStore(entityName);
    const existing = store.get(id);
    if (!existing) {
      return null;
    }
    const updated = {
      ...existing,
      ...data,
      id,
      // Preserve original ID
      updatedAt: /* @__PURE__ */ new Date()
    };
    store.set(id, updated);
    return updated;
  }
  /**
   * Delete an item.
   */
  delete(entityName, id) {
    const store = this.getStore(entityName);
    if (!store.has(id)) {
      return false;
    }
    store.delete(id);
    return true;
  }
  // ============================================================================
  // Utilities
  // ============================================================================
  /**
   * Clear all data for an entity.
   */
  clear(entityName) {
    const normalized = entityName.toLowerCase();
    this.stores.delete(normalized);
    this.idCounters.delete(normalized);
  }
  /**
   * Clear all data.
   */
  clearAll() {
    this.stores.clear();
    this.idCounters.clear();
  }
  /**
   * Get count of items for an entity.
   */
  count(entityName) {
    const store = this.getStore(entityName);
    return store.size;
  }
};
var _mockDataService = null;
function getMockDataService() {
  if (!_mockDataService) {
    _mockDataService = new MockDataService();
  }
  return _mockDataService;
}
function resetMockDataService() {
  _mockDataService?.clearAll();
  _mockDataService = null;
}

// src/utils/queryFilters.ts
var OPERATOR_MAP = {
  "eq": "==",
  "neq": "!=",
  "gt": ">",
  "gte": ">=",
  "lt": "<",
  "lte": "<=",
  "contains": "array-contains",
  "contains_any": "array-contains-any",
  "in": "in",
  "not_in": "not-in",
  // Date operators map to same comparison operators
  "date_eq": "==",
  "date_gte": ">=",
  "date_lte": "<="
};
var RESERVED_PARAMS = /* @__PURE__ */ new Set([
  "page",
  "pageSize",
  "limit",
  "offset",
  "search",
  "q",
  "sortBy",
  "sortOrder",
  "orderBy",
  "orderDirection"
]);
function parseQueryFilters(query) {
  const filters = [];
  for (const [key, value] of Object.entries(query)) {
    if (RESERVED_PARAMS.has(key)) continue;
    if (value === void 0 || value === null || value === "") continue;
    const match = key.match(/^(.+)__(\w+)$/);
    if (match) {
      const [, field, op] = match;
      const firestoreOp = OPERATOR_MAP[op];
      if (firestoreOp) {
        filters.push({
          field,
          operator: firestoreOp,
          value: parseValue(value, op)
        });
      } else {
        filters.push({
          field: key,
          operator: "==",
          value: parseValue(value, "eq")
        });
      }
    } else {
      filters.push({
        field: key,
        operator: "==",
        value: parseValue(value, "eq")
      });
    }
  }
  return filters;
}
function parseValue(value, operator) {
  if (operator === "in" || operator === "not_in" || operator === "contains_any") {
    if (typeof value === "string") {
      return value.split(",").map((v) => v.trim());
    }
    if (Array.isArray(value)) {
      return value;
    }
    return [value];
  }
  if (typeof value === "string") {
    if (/^-?\d+(\.\d+)?$/.test(value)) {
      const num = parseFloat(value);
      if (!isNaN(num)) {
        return num;
      }
    }
    if (value === "true") return true;
    if (value === "false") return false;
  }
  return value;
}
function applyFiltersToQuery(collection, filters) {
  let query = collection;
  for (const filter of filters) {
    query = query.where(
      filter.field,
      filter.operator,
      filter.value
    );
  }
  return query;
}
function extractPaginationParams(query, defaults = {}) {
  return {
    page: parseInt(query.page, 10) || defaults.page || 1,
    pageSize: parseInt(query.pageSize, 10) || parseInt(query.limit, 10) || defaults.pageSize || 20,
    sortBy: query.sortBy || query.orderBy,
    sortOrder: query.sortOrder || query.orderDirection || defaults.sortOrder || "asc"
  };
}

// src/services/DataService.ts
function applyFilterCondition(value, operator, filterValue) {
  if (value === null || value === void 0) {
    return operator === "!=" ? filterValue !== null : false;
  }
  switch (operator) {
    case "==":
      return value === filterValue;
    case "!=":
      return value !== filterValue;
    case ">":
      return value > filterValue;
    case ">=":
      return value >= filterValue;
    case "<":
      return value < filterValue;
    case "<=":
      return value <= filterValue;
    case "array-contains":
      return Array.isArray(value) && value.includes(filterValue);
    case "array-contains-any":
      return Array.isArray(value) && Array.isArray(filterValue) && filterValue.some((v) => value.includes(v));
    case "in":
      return Array.isArray(filterValue) && filterValue.includes(value);
    case "not-in":
      return Array.isArray(filterValue) && !filterValue.includes(value);
    default:
      return true;
  }
}
var MockDataServiceAdapter = class {
  async list(collection) {
    return getMockDataService().list(collection);
  }
  async listPaginated(collection, options = {}) {
    const {
      page = 1,
      pageSize = 20,
      search,
      searchFields,
      sortBy,
      sortOrder = "asc",
      filters
    } = options;
    let items = getMockDataService().list(collection);
    if (filters && filters.length > 0) {
      items = items.filter((item) => {
        const record = item;
        return filters.every((filter) => {
          const value = record[filter.field];
          return applyFilterCondition(value, filter.operator, filter.value);
        });
      });
    }
    if (search && search.trim()) {
      const searchLower = search.toLowerCase();
      items = items.filter((item) => {
        const record = item;
        const fieldsToSearch = searchFields || Object.keys(record);
        return fieldsToSearch.some((field) => {
          const value = record[field];
          if (value === null || value === void 0) return false;
          return String(value).toLowerCase().includes(searchLower);
        });
      });
    }
    if (sortBy) {
      items = [...items].sort((a, b) => {
        const aVal = a[sortBy];
        const bVal = b[sortBy];
        if (aVal === bVal) return 0;
        if (aVal === null || aVal === void 0) return 1;
        if (bVal === null || bVal === void 0) return -1;
        const comparison = aVal < bVal ? -1 : 1;
        return sortOrder === "asc" ? comparison : -comparison;
      });
    }
    const total = items.length;
    const totalPages = Math.ceil(total / pageSize);
    const startIndex = (page - 1) * pageSize;
    const data = items.slice(startIndex, startIndex + pageSize);
    return { data, total, page, pageSize, totalPages };
  }
  async getById(collection, id) {
    return getMockDataService().getById(collection, id);
  }
  async create(collection, data) {
    return getMockDataService().create(collection, data);
  }
  async update(collection, id, data) {
    return getMockDataService().update(collection, id, data);
  }
  async delete(collection, id) {
    return getMockDataService().delete(collection, id);
  }
  async query(collection, filters) {
    let items = getMockDataService().list(collection);
    for (const filter of filters) {
      items = items.filter((item) => {
        const value = item[filter.field];
        return applyFilterCondition(value, filter.op, filter.value);
      });
    }
    return items;
  }
  getStore(collection) {
    const adapter = this;
    return {
      async getById(id) {
        return adapter.getById(collection, id);
      },
      async create(data) {
        return adapter.create(collection, data);
      },
      async update(id, data) {
        const result = await adapter.update(collection, id, data);
        if (!result) throw new Error(`Entity ${id} not found in ${collection}`);
        return result;
      },
      async delete(id) {
        adapter.delete(collection, id);
      },
      async query(filters) {
        return adapter.query(collection, filters);
      }
    };
  }
};
var FirebaseDataService = class {
  async list(collection) {
    const snapshot = await db.collection(collection).get();
    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data()
    }));
  }
  async listPaginated(collection, options = {}) {
    const {
      page = 1,
      pageSize = 20,
      search,
      searchFields,
      sortBy,
      sortOrder = "asc",
      filters
    } = options;
    let query = db.collection(collection);
    if (filters && filters.length > 0) {
      query = applyFiltersToQuery(query, filters);
    }
    if (sortBy && !search) {
      query = query.orderBy(sortBy, sortOrder);
    }
    const snapshot = await query.get();
    let items = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data()
    }));
    if (search && search.trim()) {
      const searchLower = search.toLowerCase();
      items = items.filter((item) => {
        const record = item;
        const fieldsToSearch = searchFields || Object.keys(record);
        return fieldsToSearch.some((field) => {
          const value = record[field];
          if (value === null || value === void 0) return false;
          return String(value).toLowerCase().includes(searchLower);
        });
      });
    }
    if (sortBy && search) {
      items = [...items].sort((a, b) => {
        const aVal = a[sortBy];
        const bVal = b[sortBy];
        if (aVal === bVal) return 0;
        if (aVal === null || aVal === void 0) return 1;
        if (bVal === null || bVal === void 0) return -1;
        const comparison = aVal < bVal ? -1 : 1;
        return sortOrder === "asc" ? comparison : -comparison;
      });
    }
    const total = items.length;
    const totalPages = Math.ceil(total / pageSize);
    const startIndex = (page - 1) * pageSize;
    const data = items.slice(startIndex, startIndex + pageSize);
    return { data, total, page, pageSize, totalPages };
  }
  async getById(collection, id) {
    const doc = await db.collection(collection).doc(id).get();
    if (!doc.exists) {
      return null;
    }
    return { id: doc.id, ...doc.data() };
  }
  async create(collection, data) {
    const now = /* @__PURE__ */ new Date();
    const docRef = await db.collection(collection).add({
      ...data,
      createdAt: now,
      updatedAt: now
    });
    return {
      ...data,
      id: docRef.id,
      createdAt: now,
      updatedAt: now
    };
  }
  async update(collection, id, data) {
    const docRef = db.collection(collection).doc(id);
    const doc = await docRef.get();
    if (!doc.exists) {
      return null;
    }
    const now = /* @__PURE__ */ new Date();
    await docRef.update({
      ...data,
      updatedAt: now
    });
    return {
      ...doc.data(),
      ...data,
      id,
      updatedAt: now
    };
  }
  async delete(collection, id) {
    const docRef = db.collection(collection).doc(id);
    const doc = await docRef.get();
    if (!doc.exists) {
      return false;
    }
    await docRef.delete();
    return true;
  }
  async query(collection, filters) {
    let query = db.collection(collection);
    const memoryFilters = [];
    for (const filter of filters) {
      if (["==", "!=", "<", "<=", ">", ">=", "in", "not-in"].includes(filter.op)) {
        query = query.where(filter.field, filter.op, filter.value);
      } else {
        memoryFilters.push(filter);
      }
    }
    const snapshot = await query.get();
    let items = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data()
    }));
    for (const filter of memoryFilters) {
      items = items.filter((item) => {
        const value = item[filter.field];
        return applyFilterCondition(value, filter.op, filter.value);
      });
    }
    return items;
  }
  getStore(collection) {
    const svc = this;
    return {
      async getById(id) {
        return svc.getById(collection, id);
      },
      async create(data) {
        return svc.create(collection, data);
      },
      async update(id, data) {
        const result = await svc.update(collection, id, data);
        if (!result) throw new Error(`Entity ${id} not found in ${collection}`);
        return result;
      },
      async delete(id) {
        await svc.delete(collection, id);
      },
      async query(filters) {
        return svc.query(collection, filters);
      }
    };
  }
};
function createDataService() {
  if (env.USE_MOCK_DATA) {
    logger.info("[DataService] Using MockDataService");
    return new MockDataServiceAdapter();
  }
  logger.info("[DataService] Using FirebaseDataService");
  return new FirebaseDataService();
}
var _dataService = null;
function getDataService() {
  if (!_dataService) {
    _dataService = createDataService();
  }
  return _dataService;
}
function resetDataService() {
  _dataService = null;
}
function seedMockData(entities) {
  if (!env.USE_MOCK_DATA) {
    logger.info("[DataService] Mock mode disabled, skipping seed");
    return;
  }
  logger.info("[DataService] Seeding mock data...");
  for (const entity of entities) {
    getMockDataService().seed(entity.name, entity.fields, entity.seedCount);
  }
  logger.info("[DataService] Mock data seeding complete");
}

// src/stores/firestoreFormat.ts
function toFirestoreFormat(schema) {
  const data = { ...schema };
  if (schema.orbitals) {
    data._orbitalsJson = JSON.stringify(schema.orbitals);
    data.orbitalCount = schema.orbitals.length;
    delete data.orbitals;
  }
  if (data.traits) {
    const traits = data.traits;
    data._traitsJson = JSON.stringify(traits);
    data.traitCount = traits.length;
    delete data.traits;
  }
  if (schema.services) {
    data._servicesJson = JSON.stringify(schema.services);
    data.serviceCount = schema.services.length;
    delete data.services;
  }
  return data;
}
function fromFirestoreFormat(data) {
  const result = { ...data };
  if (result._orbitalsJson && typeof result._orbitalsJson === "string") {
    try {
      result.orbitals = JSON.parse(result._orbitalsJson);
      delete result._orbitalsJson;
      delete result.orbitalCount;
    } catch (e) {
      console.warn("[OrbitalStore] Failed to parse _orbitalsJson:", e);
      result.orbitals = [];
    }
  }
  if (result._traitsJson && typeof result._traitsJson === "string") {
    try {
      result.traits = JSON.parse(result._traitsJson);
      delete result._traitsJson;
      delete result.traitCount;
    } catch (e) {
      console.warn("[OrbitalStore] Failed to parse _traitsJson:", e);
    }
  }
  if (result._servicesJson && typeof result._servicesJson === "string") {
    try {
      result.services = JSON.parse(result._servicesJson);
      delete result._servicesJson;
      delete result.serviceCount;
    } catch (e) {
      console.warn("[OrbitalStore] Failed to parse _servicesJson:", e);
    }
  }
  return result;
}
var SchemaProtectionService = class {
  /**
   * Compare two schemas and detect destructive changes.
   *
   * Returns categorized removals including page content reductions.
   */
  compareSchemas(before, after) {
    const changeSet = diffSchemas(before, after);
    const removals = categorizeRemovals(changeSet);
    const beforePages = before.orbitals?.flatMap((o) => o.pages || []) || [];
    const afterPages = after.orbitals?.flatMap((o) => o.pages || []) || [];
    const pageContentReductions = detectPageContentReduction(beforePages, afterPages);
    removals.pageContentReductions = pageContentReductions;
    const isDestructive = isDestructiveChange(changeSet) || hasSignificantPageReduction(pageContentReductions);
    return { isDestructive, removals };
  }
  /** Check if critical removals require confirmation */
  requiresConfirmation(removals) {
    return requiresConfirmation(removals);
  }
  /** Check for significant page content reductions */
  hasSignificantContentReduction(reductions) {
    return hasSignificantPageReduction(reductions);
  }
};

// src/stores/SchemaStore.ts
var SCHEMA_CACHE_TTL_MS = 6e4;
var LIST_CACHE_TTL_MS = 3e4;
var SchemaStore = class {
  appsCollection;
  schemaCache = /* @__PURE__ */ new Map();
  listCache = /* @__PURE__ */ new Map();
  protectionService = new SchemaProtectionService();
  snapshotStore = null;
  constructor(appsCollection = "apps") {
    this.appsCollection = appsCollection;
  }
  /** Set snapshot store for auto-snapshot on destructive saves */
  setSnapshotStore(store) {
    this.snapshotStore = store;
  }
  /** Get a schema by app ID */
  async get(uid, appId) {
    const cacheKey = `${uid}:${appId}`;
    const cached = this.schemaCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < SCHEMA_CACHE_TTL_MS) {
      return cached.schema;
    }
    try {
      const db2 = getFirestore();
      const appDoc = await db2.doc(`users/${uid}/${this.appsCollection}/${appId}`).get();
      if (!appDoc.exists) return null;
      const data = appDoc.data();
      const hasOrbitals = data.orbitals || data._orbitalsJson;
      if (!data.name || !hasOrbitals) return null;
      const schema = fromFirestoreFormat(data);
      this.schemaCache.set(cacheKey, { schema, timestamp: Date.now() });
      return schema;
    } catch (error) {
      console.error("[SchemaStore] Error fetching schema:", error);
      return null;
    }
  }
  /**
   * Save a schema (create or full replace).
   *
   * Features:
   * - Detects destructive changes (removals)
   * - Requires confirmation for critical removals
   * - Auto-creates snapshots before destructive changes (if SnapshotStore attached)
   */
  async save(uid, appId, schema, options = {}) {
    try {
      const existingSchema = await this.get(uid, appId);
      let snapshotId;
      if (existingSchema && options.snapshotReason && this.snapshotStore) {
        snapshotId = await this.snapshotStore.create(uid, appId, existingSchema, options.snapshotReason);
      }
      if (existingSchema && !options.skipProtection) {
        const comparison = this.protectionService.compareSchemas(existingSchema, schema);
        if (comparison.isDestructive) {
          const { removals } = comparison;
          const hasCriticalRemovals = this.protectionService.requiresConfirmation(removals);
          const hasContentReductions = this.protectionService.hasSignificantContentReduction(
            removals.pageContentReductions
          );
          if ((hasCriticalRemovals || hasContentReductions) && !options.confirmRemovals) {
            return {
              success: false,
              requiresConfirmation: true,
              removals: comparison.removals,
              error: hasContentReductions ? "Page content reduction detected - confirmation required" : "Confirmation required for critical removals"
            };
          }
          if (!snapshotId && this.snapshotStore && (removals.critical.length > 0 || removals.pageContentReductions.length > 0)) {
            snapshotId = await this.snapshotStore.create(
              uid,
              appId,
              existingSchema,
              `auto_before_removal_${Date.now()}`
            );
          }
        }
      }
      const firestoreData = toFirestoreFormat(schema);
      const now = Date.now();
      const docData = {
        ...firestoreData,
        _metadata: {
          version: options.expectedVersion ? options.expectedVersion + 1 : 1,
          updatedAt: now,
          createdAt: existingSchema ? void 0 : now,
          source: options.source || "manual"
        }
      };
      const db2 = getFirestore();
      await db2.doc(`users/${uid}/${this.appsCollection}/${appId}`).set(docData, { merge: true });
      this.invalidateCache(uid, appId);
      return { success: true, snapshotId };
    } catch (error) {
      console.error("[SchemaStore] Error saving schema:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error"
      };
    }
  }
  /** Create a new app with initial schema */
  async create(uid, metadata) {
    const appId = `app-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const now = Date.now();
    const schema = {
      name: metadata.name,
      description: metadata.description,
      orbitals: []
    };
    const firestoreData = toFirestoreFormat(schema);
    const docData = {
      ...firestoreData,
      _metadata: { version: 1, createdAt: now, updatedAt: now, source: "manual" }
    };
    const db2 = getFirestore();
    await db2.doc(`users/${uid}/${this.appsCollection}/${appId}`).set(docData);
    this.listCache.delete(uid);
    return { appId, schema };
  }
  /** Delete an app */
  async delete(uid, appId) {
    try {
      const db2 = getFirestore();
      const ref = db2.doc(`users/${uid}/${this.appsCollection}/${appId}`);
      const doc = await ref.get();
      if (!doc.exists) return false;
      await ref.delete();
      this.invalidateCache(uid, appId);
      return true;
    } catch (error) {
      console.error("[SchemaStore] Error deleting app:", error);
      return false;
    }
  }
  /** List all apps for a user */
  async list(uid) {
    const cached = this.listCache.get(uid);
    if (cached && Date.now() - cached.timestamp < LIST_CACHE_TTL_MS) {
      return cached.apps;
    }
    try {
      const db2 = getFirestore();
      const snapshot = await db2.collection(`users/${uid}/${this.appsCollection}`).select("name", "description", "domainContext", "_metadata", "orbitalCount", "traitCount").orderBy("_metadata.updatedAt", "desc").get();
      const apps = snapshot.docs.map((doc) => {
        const data = doc.data();
        const metadata = data._metadata;
        const orbitalCount = data.orbitalCount;
        return {
          id: doc.id,
          name: data.name || "Untitled",
          description: data.description,
          updatedAt: metadata?.updatedAt || Date.now(),
          createdAt: metadata?.createdAt || Date.now(),
          stats: { entities: orbitalCount ?? 0, pages: 0, states: 0, events: 0, transitions: 0 },
          domainContext: data.domainContext,
          hasValidationErrors: false
        };
      });
      this.listCache.set(uid, { apps, timestamp: Date.now() });
      return apps;
    } catch (error) {
      console.error("[SchemaStore] Error listing apps:", error);
      return [];
    }
  }
  /** Compute stats from OrbitalSchema */
  computeStats(schema) {
    const orbitals = schema.orbitals || [];
    const entities = orbitals.length;
    const pages = orbitals.reduce((n, o) => n + (o.pages?.length || 0), 0);
    const allTraits = [
      ...schema.traits || [],
      ...orbitals.flatMap(
        (o) => (o.traits || []).filter((t) => typeof t !== "string" && "stateMachine" in t)
      )
    ];
    return {
      states: allTraits.flatMap((t) => t.stateMachine?.states || []).length,
      events: allTraits.flatMap((t) => t.stateMachine?.events || []).length,
      pages,
      entities,
      transitions: allTraits.flatMap((t) => t.stateMachine?.transitions || []).length
    };
  }
  /** Invalidate caches for a specific app */
  invalidateCache(uid, appId) {
    this.schemaCache.delete(`${uid}:${appId}`);
    this.listCache.delete(uid);
  }
  /** Clear all caches */
  clearCaches() {
    this.schemaCache.clear();
    this.listCache.clear();
  }
  /** Get the collection path for an app */
  getAppDocPath(uid, appId) {
    return `users/${uid}/${this.appsCollection}/${appId}`;
  }
  /** Expose apps collection name for subcollection stores */
  getAppsCollection() {
    return this.appsCollection;
  }
};

// src/stores/SnapshotStore.ts
var SNAPSHOTS_COLLECTION = "snapshots";
var SnapshotStore = class {
  appsCollection;
  constructor(appsCollection = "apps") {
    this.appsCollection = appsCollection;
  }
  getCollectionPath(uid, appId) {
    return `users/${uid}/${this.appsCollection}/${appId}/${SNAPSHOTS_COLLECTION}`;
  }
  getAppDocPath(uid, appId) {
    return `users/${uid}/${this.appsCollection}/${appId}`;
  }
  /** Create a snapshot of the current schema */
  async create(uid, appId, schema, reason) {
    const db2 = getFirestore();
    const snapshotId = `snapshot_${Date.now()}`;
    const snapshotDoc = {
      id: snapshotId,
      timestamp: Date.now(),
      schema: toFirestoreFormat(schema),
      reason
    };
    await db2.doc(`${this.getCollectionPath(uid, appId)}/${snapshotId}`).set(snapshotDoc);
    const appDocRef = db2.doc(this.getAppDocPath(uid, appId));
    const appDoc = await appDocRef.get();
    const currentMeta = appDoc.data()?._historyMeta;
    const updatedMeta = {
      latestSnapshotId: snapshotId,
      latestChangeSetId: currentMeta?.latestChangeSetId,
      snapshotCount: (currentMeta?.snapshotCount || 0) + 1,
      changeSetCount: currentMeta?.changeSetCount || 0
    };
    await appDocRef.set({ _historyMeta: updatedMeta }, { merge: true });
    return snapshotId;
  }
  /** Get all snapshots for an app (ordered by timestamp desc) */
  async getAll(uid, appId) {
    const db2 = getFirestore();
    const query = await db2.collection(this.getCollectionPath(uid, appId)).orderBy("timestamp", "desc").get();
    return query.docs.map((doc) => doc.data());
  }
  /** Get a specific snapshot by ID */
  async get(uid, appId, snapshotId) {
    const db2 = getFirestore();
    const doc = await db2.doc(`${this.getCollectionPath(uid, appId)}/${snapshotId}`).get();
    if (!doc.exists) return null;
    return doc.data();
  }
  /** Delete a snapshot */
  async delete(uid, appId, snapshotId) {
    const db2 = getFirestore();
    const ref = db2.doc(`${this.getCollectionPath(uid, appId)}/${snapshotId}`);
    const doc = await ref.get();
    if (!doc.exists) return false;
    await ref.delete();
    const appDocRef = db2.doc(this.getAppDocPath(uid, appId));
    const appDoc = await appDocRef.get();
    const currentMeta = appDoc.data()?._historyMeta;
    if (currentMeta) {
      const updatedMeta = {
        ...currentMeta,
        snapshotCount: Math.max(0, (currentMeta.snapshotCount || 1) - 1),
        latestSnapshotId: currentMeta.latestSnapshotId === snapshotId ? void 0 : currentMeta.latestSnapshotId
      };
      await appDocRef.set({ _historyMeta: updatedMeta }, { merge: true });
    }
    return true;
  }
  /** Get schema snapshot at a specific version */
  async getByVersion(uid, appId, version) {
    const db2 = getFirestore();
    const query = await db2.collection(this.getCollectionPath(uid, appId)).where("version", "==", version).limit(1).get();
    if (query.empty) return null;
    const snapshot = query.docs[0].data();
    return fromFirestoreFormat(snapshot.schema);
  }
  /** Get the schema from a snapshot (deserialized) */
  getSchemaFromSnapshot(snapshot) {
    return fromFirestoreFormat(snapshot.schema);
  }
};

// src/stores/ChangeSetStore.ts
var CHANGESETS_COLLECTION = "changesets";
var ChangeSetStore = class {
  appsCollection;
  constructor(appsCollection = "apps") {
    this.appsCollection = appsCollection;
  }
  getCollectionPath(uid, appId) {
    return `users/${uid}/${this.appsCollection}/${appId}/${CHANGESETS_COLLECTION}`;
  }
  getAppDocPath(uid, appId) {
    return `users/${uid}/${this.appsCollection}/${appId}`;
  }
  /** Append a changeset to history */
  async append(uid, appId, changeSet) {
    const db2 = getFirestore();
    await db2.doc(`${this.getCollectionPath(uid, appId)}/${changeSet.id}`).set(changeSet);
    const appDocRef = db2.doc(this.getAppDocPath(uid, appId));
    const appDoc = await appDocRef.get();
    const currentMeta = appDoc.data()?._historyMeta;
    const updatedMeta = {
      latestSnapshotId: currentMeta?.latestSnapshotId,
      latestChangeSetId: changeSet.id,
      snapshotCount: currentMeta?.snapshotCount || 0,
      changeSetCount: (currentMeta?.changeSetCount || 0) + 1
    };
    await appDocRef.set({ _historyMeta: updatedMeta }, { merge: true });
  }
  /** Get change history for an app (ordered by version desc) */
  async getHistory(uid, appId) {
    try {
      const db2 = getFirestore();
      const query = await db2.collection(this.getCollectionPath(uid, appId)).orderBy("version", "desc").get();
      return query.docs.map((doc) => doc.data());
    } catch (error) {
      console.error("[ChangeSetStore] Error getting change history:", error);
      return [];
    }
  }
  /** Get a specific changeset by ID */
  async get(uid, appId, changeSetId) {
    const db2 = getFirestore();
    const doc = await db2.doc(`${this.getCollectionPath(uid, appId)}/${changeSetId}`).get();
    if (!doc.exists) return null;
    return doc.data();
  }
  /** Update a changeset's status */
  async updateStatus(uid, appId, changeSetId, status) {
    const db2 = getFirestore();
    const ref = db2.doc(`${this.getCollectionPath(uid, appId)}/${changeSetId}`);
    const doc = await ref.get();
    if (!doc.exists) return;
    await ref.update({ status });
  }
  /** Delete a changeset */
  async delete(uid, appId, changeSetId) {
    const db2 = getFirestore();
    const ref = db2.doc(`${this.getCollectionPath(uid, appId)}/${changeSetId}`);
    const doc = await ref.get();
    if (!doc.exists) return false;
    await ref.delete();
    const appDocRef = db2.doc(this.getAppDocPath(uid, appId));
    const appDoc = await appDocRef.get();
    const currentMeta = appDoc.data()?._historyMeta;
    if (currentMeta) {
      const updatedMeta = {
        ...currentMeta,
        changeSetCount: Math.max(0, (currentMeta.changeSetCount || 1) - 1),
        latestChangeSetId: currentMeta.latestChangeSetId === changeSetId ? void 0 : currentMeta.latestChangeSetId
      };
      await appDocRef.set({ _historyMeta: updatedMeta }, { merge: true });
    }
    return true;
  }
};

// src/stores/ValidationStore.ts
var VALIDATION_COLLECTION = "validation";
var VALIDATION_DOC_ID = "current";
var ValidationStore = class {
  appsCollection;
  constructor(appsCollection = "apps") {
    this.appsCollection = appsCollection;
  }
  getDocPath(uid, appId) {
    return `users/${uid}/${this.appsCollection}/${appId}/${VALIDATION_COLLECTION}/${VALIDATION_DOC_ID}`;
  }
  getAppDocPath(uid, appId) {
    return `users/${uid}/${this.appsCollection}/${appId}`;
  }
  /** Save validation results */
  async save(uid, appId, results) {
    const db2 = getFirestore();
    await db2.doc(this.getDocPath(uid, appId)).set(results);
    const validationMeta = {
      errorCount: results.errors?.length || 0,
      warningCount: results.warnings?.length || 0,
      validatedAt: results.validatedAt
    };
    await db2.doc(this.getAppDocPath(uid, appId)).set(
      { _operational: { validationMeta } },
      { merge: true }
    );
  }
  /** Get validation results */
  async get(uid, appId) {
    try {
      const db2 = getFirestore();
      const doc = await db2.doc(this.getDocPath(uid, appId)).get();
      if (!doc.exists) return null;
      return doc.data();
    } catch (error) {
      console.error("[ValidationStore] Error getting validation results:", error);
      return null;
    }
  }
  /** Clear validation results */
  async clear(uid, appId) {
    const db2 = getFirestore();
    const { FieldValue } = await import('firebase-admin/firestore');
    await db2.doc(this.getDocPath(uid, appId)).delete();
    await db2.doc(this.getAppDocPath(uid, appId)).update({
      "_operational.validationMeta": FieldValue.delete()
    });
  }
};
var memoryManager = null;
function getMemoryManager() {
  if (!memoryManager) {
    memoryManager = new MemoryManager({
      db,
      usersCollection: "agent_memory_users",
      projectsCollection: "agent_memory_projects",
      generationsCollection: "agent_memory_generations",
      patternsCollection: "agent_memory_patterns",
      interruptsCollection: "agent_memory_interrupts",
      feedbackCollection: "agent_memory_feedback",
      checkpointsCollection: "agent_memory_checkpoints",
      toolPreferencesCollection: "agent_memory_tool_preferences"
    });
  }
  return memoryManager;
}
function resetMemoryManager() {
  memoryManager = null;
}
var sessionManager = null;
function createFirestoreAdapter(firestore) {
  return firestore;
}
function getSessionManager() {
  if (!sessionManager) {
    sessionManager = new SessionManager({
      mode: "firestore",
      firestoreDb: createFirestoreAdapter(db),
      memoryManager: getMemoryManager(),
      // Enable GAP-002D
      compactionConfig: {
        maxTokens: 15e4,
        keepRecentMessages: 10,
        strategy: "last"
      }
    });
  }
  return sessionManager;
}
function resetSessionManager() {
  sessionManager = null;
}
async function createServerSkillAgent(options) {
  const memoryManager2 = getMemoryManager();
  getSessionManager();
  const observability = getObservabilityCollector();
  const multiUser = getMultiUserManager();
  if (options.threadId) {
    const access = multiUser.canAccessSession(options.threadId, {
      userId: options.userId,
      roles: ["user"]
    });
    if (!access.allowed) {
      throw new Error(`Access denied: ${access.reason}`);
    }
  }
  observability.startSession(options.threadId ?? "new", options.userId);
  const workflowToolWrapper = createWorkflowToolWrapper({
    maxRetries: 2,
    enableTelemetry: true,
    timeoutMs: 3e5
    // 5 minutes
  });
  try {
    const result = await createSkillAgent({
      ...options,
      memoryManager: memoryManager2,
      // GAP-001: Enable memory
      userId: options.userId,
      // GAP-002D: Session → Memory sync
      appId: options.appId,
      toolWrapper: workflowToolWrapper.wrap
      // Always use workflow wrapper for reliability
    });
    if (result.threadId) {
      multiUser.assignSessionOwnership(result.threadId, options.userId);
    }
    observability.recordEvent({
      type: "session_start",
      sessionId: result.threadId,
      userId: options.userId,
      payload: { skill: options.skill }
    });
    return result;
  } catch (error) {
    observability.recordError(options.threadId ?? "new", error);
    throw error;
  }
}
async function multiUserMiddleware(req, res, next) {
  const userId = req.user?.uid;
  if (!userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  req.userContext = createUserContext(userId, {
    orgId: req.user?.orgId,
    roles: req.user?.roles ?? ["user"]
  });
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (body && typeof body === "object" && "threadId" in body) {
      const multiUser = getMultiUserManager();
      multiUser.assignSessionOwnership(
        body.threadId,
        userId
      );
    }
    return originalJson(body);
  };
  next();
}
async function verifyFirebaseAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "No token provided" });
    return;
  }
  const token = authHeader.split("Bearer ")[1];
  try {
    const decodedToken = await getAuth().verifyIdToken(token);
    const user = await getAuth().getUser(decodedToken.uid);
    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email,
      roles: user.customClaims?.roles ?? ["user"],
      orgId: user.customClaims?.orgId
    };
    next();
  } catch (error) {
    console.error("Token verification failed:", error);
    res.status(401).json({ error: "Invalid token" });
  }
}
function setupStateSyncWebSocket(io) {
  const stateSync = getStateSyncManager();
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) {
        return next(new Error("Authentication required"));
      }
      const decodedToken = await getAuth().verifyIdToken(token);
      const user = await getAuth().getUser(decodedToken.uid);
      socket.data.user = {
        uid: decodedToken.uid,
        roles: user.customClaims?.roles ?? ["user"],
        orgId: user.customClaims?.orgId
      };
      next();
    } catch (error) {
      console.error("Socket auth failed:", error);
      next(new Error("Invalid token"));
    }
  });
  io.on("connection", (socket) => {
    const userId = socket.data.user.uid;
    const clientId = socket.handshake.auth.clientId;
    console.log(`[StateSync] Client ${clientId} connected for user ${userId}`);
    stateSync.updateConfig({ clientId });
    socket.join(`user:${userId}`);
    socket.on("stateChange", (...args) => {
      const event = args[0];
      const multiUser = getMultiUserManager();
      if (!multiUser.isSessionOwner(event.threadId, userId)) {
        socket.emit("error", { message: "Not session owner" });
        return;
      }
      stateSync.receiveRemoteChange(event);
      socket.to(`user:${userId}`).emit("remoteChange", event);
    });
    stateSync.on("syncRequired", (changes) => {
      socket.emit("syncBatch", changes);
    });
    socket.on("disconnect", () => {
      console.log(`[StateSync] Client ${clientId} disconnected`);
      socket.leave(`user:${userId}`);
    });
  });
}

// src/lib/serviceDiscovery.ts
var InMemoryServiceRegistry = class {
  services = /* @__PURE__ */ new Map();
  async register(service) {
    this.services.set(service.instanceId, {
      ...service,
      registeredAt: Date.now(),
      lastHeartbeat: Date.now()
    });
  }
  async deregister(instanceId) {
    this.services.delete(instanceId);
  }
  async heartbeat(instanceId) {
    const service = this.services.get(instanceId);
    if (service) {
      service.lastHeartbeat = Date.now();
    }
  }
  async updateStatus(instanceId, status) {
    const service = this.services.get(instanceId);
    if (service) {
      service.status = status;
    }
  }
  async getAll() {
    return Array.from(this.services.values());
  }
  async getByName(name) {
    return Array.from(this.services.values()).filter((s) => s.name === name);
  }
  async findListeners(event) {
    return Array.from(this.services.values()).filter(
      (s) => s.listens.includes(event) && s.status !== "stopping"
    );
  }
  async findEmitters(event) {
    return Array.from(this.services.values()).filter(
      (s) => s.emits.includes(event) && s.status !== "stopping"
    );
  }
  async cleanup(ttlMs) {
    const cutoff = Date.now() - ttlMs;
    let removed = 0;
    for (const [id, service] of this.services) {
      if (service.lastHeartbeat < cutoff) {
        this.services.delete(id);
        removed++;
      }
    }
    return removed;
  }
};
var ServiceDiscovery = class {
  registry;
  options;
  cleanupTimer = null;
  constructor(options, registry) {
    this.options = {
      heartbeatTtlMs: options?.heartbeatTtlMs ?? 6e4,
      cleanupIntervalMs: options?.cleanupIntervalMs ?? 3e4
    };
    this.registry = registry ?? new InMemoryServiceRegistry();
  }
  /**
   * Register a service with the registry.
   */
  async register(service) {
    await this.registry.register({
      ...service,
      status: service.status ?? "starting",
      registeredAt: Date.now(),
      lastHeartbeat: Date.now()
    });
  }
  /**
   * Deregister a service.
   */
  async deregister(instanceId) {
    await this.registry.deregister(instanceId);
  }
  /**
   * Send heartbeat for a service.
   */
  async heartbeat(instanceId) {
    await this.registry.heartbeat(instanceId);
  }
  /**
   * Mark a service as ready.
   */
  async markReady(instanceId) {
    await this.registry.updateStatus(instanceId, "ready");
  }
  /**
   * Mark a service as degraded.
   */
  async markDegraded(instanceId) {
    await this.registry.updateStatus(instanceId, "degraded");
  }
  /**
   * Find all services that listen for a given event.
   */
  async findListeners(event) {
    return this.registry.findListeners(event);
  }
  /**
   * Find all services that emit a given event.
   */
  async findEmitters(event) {
    return this.registry.findEmitters(event);
  }
  /**
   * Get all registered services.
   */
  async getAll() {
    return this.registry.getAll();
  }
  /**
   * Get the full event topology (who emits what, who listens for what).
   */
  async getEventTopology() {
    const services = await this.registry.getAll();
    const eventMap = /* @__PURE__ */ new Map();
    for (const service of services) {
      for (const event of service.emits) {
        if (!eventMap.has(event)) eventMap.set(event, { emitters: /* @__PURE__ */ new Set(), listeners: /* @__PURE__ */ new Set() });
        eventMap.get(event).emitters.add(service.name);
      }
      for (const event of service.listens) {
        if (!eventMap.has(event)) eventMap.set(event, { emitters: /* @__PURE__ */ new Set(), listeners: /* @__PURE__ */ new Set() });
        eventMap.get(event).listeners.add(service.name);
      }
    }
    const events = Array.from(eventMap.entries()).map(([event, { emitters, listeners }]) => ({
      event,
      emitters: Array.from(emitters),
      listeners: Array.from(listeners)
    }));
    return { events };
  }
  /**
   * Start periodic cleanup of expired services.
   */
  startCleanup() {
    if (this.cleanupTimer) return;
    this.cleanupTimer = setInterval(() => {
      this.registry.cleanup(this.options.heartbeatTtlMs).catch((err) => {
        console.error("[ServiceDiscovery] Cleanup error:", err);
      });
    }, this.options.cleanupIntervalMs);
  }
  /**
   * Stop periodic cleanup.
   */
  stopCleanup() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }
  /**
   * Get the underlying registry (for testing).
   */
  getRegistry() {
    return this.registry;
  }
};
var router = Router();
router.get("/metrics", async (req, res) => {
  try {
    const collector = getObservabilityCollector();
    const snapshot = collector.getPerformanceSnapshot();
    res.json(snapshot);
  } catch (error) {
    console.error("Metrics error:", error);
    res.status(500).json({ error: "Failed to get metrics" });
  }
});
router.get("/health", async (req, res) => {
  try {
    const collector = getObservabilityCollector();
    const health = await collector.healthCheck();
    const allHealthy = health.every((h) => h.status === "healthy");
    res.status(allHealthy ? 200 : 503).json({
      status: allHealthy ? "healthy" : "degraded",
      timestamp: Date.now(),
      checks: health
    });
  } catch (error) {
    console.error("Health check error:", error);
    res.status(500).json({
      status: "unhealthy",
      error: "Health check failed"
    });
  }
});
router.get("/sessions/:threadId/telemetry", async (req, res) => {
  try {
    const collector = getObservabilityCollector();
    const telemetry = collector.getSessionTelemetry(req.params.threadId);
    if (!telemetry) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    res.json(telemetry);
  } catch (error) {
    console.error("Telemetry error:", error);
    res.status(500).json({ error: "Failed to get telemetry" });
  }
});
router.get("/active-sessions", async (req, res) => {
  try {
    const collector = getObservabilityCollector();
    const sessions = collector.getActiveSessions();
    res.json(sessions);
  } catch (error) {
    console.error("Active sessions error:", error);
    res.status(500).json({ error: "Failed to get active sessions" });
  }
});
var observability_default = router;

export { AppError, ChangeSetStore, ConflictError, DistributedEventBus, EventBus, EventPersistence, ForbiddenError, InMemoryEventStore, InMemoryServiceRegistry, InMemoryTransport, MockDataService, NotFoundError, RedisTransport, SchemaProtectionService, SchemaStore, ServiceDiscovery, SnapshotStore, UnauthorizedError, ValidationError, ValidationStore, applyFiltersToQuery, asyncHandler, authenticateFirebase, closeWebSocketServer, createServerSkillAgent, db, debugEventsRouter, emitEntityEvent, env, errorHandler, extractPaginationParams, fromFirestoreFormat, getMemoryManager as getAgentMemoryManager, getSessionManager as getAgentSessionManager, getAuth, getConnectedClientCount, getDataService, getFirestore, getMemoryManager, getMockDataService, getServerEventBus, getSessionManager, getWebSocketServer, initializeFirebase, logger, multiUserMiddleware, notFoundHandler, observability_default as observabilityRouter, parseQueryFilters, resetDataService, resetMemoryManager, resetMockDataService, resetServerEventBus, resetSessionManager, seedMockData, setupEventBroadcast, setupStateSyncWebSocket, toFirestoreFormat, validateBody, validateParams, validateQuery, verifyFirebaseAuth };
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map