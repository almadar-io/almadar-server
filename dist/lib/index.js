import { z } from 'zod';
import dotenv from 'dotenv';
import admin from 'firebase-admin';
export { default as admin } from 'firebase-admin';
import { WebSocketServer, WebSocket } from 'ws';

// src/lib/env.ts
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
new Proxy({}, {
  get(_target, prop, receiver) {
    const firestore = getFirestore();
    const value = Reflect.get(firestore, prop, receiver);
    return typeof value === "function" ? value.bind(firestore) : value;
  }
});

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

export { closeWebSocketServer, emitEntityEvent, env, getAuth, getConnectedClientCount, getFirestore, getServerEventBus, getWebSocketServer, logger, resetServerEventBus, setupEventBroadcast };
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map