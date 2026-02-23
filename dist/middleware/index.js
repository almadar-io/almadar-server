import { z, ZodError } from 'zod';
import dotenv from 'dotenv';
import admin from 'firebase-admin';

// src/middleware/errorHandler.ts
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

// src/middleware/errorHandler.ts
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

export { AppError, ConflictError, ForbiddenError, NotFoundError, UnauthorizedError, ValidationError, asyncHandler, authenticateFirebase, errorHandler, notFoundHandler, validateBody, validateParams, validateQuery };
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map