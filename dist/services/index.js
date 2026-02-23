import { faker } from '@faker-js/faker';
import { z } from 'zod';
import dotenv from 'dotenv';
import admin from 'firebase-admin';

// src/services/MockDataService.ts
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

// src/services/MockDataService.ts
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
var mockDataService = new MockDataService();
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
var db = new Proxy({}, {
  get(_target, prop, receiver) {
    const firestore = getFirestore();
    const value = Reflect.get(firestore, prop, receiver);
    return typeof value === "function" ? value.bind(firestore) : value;
  }
});

// src/utils/queryFilters.ts
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
    return mockDataService.list(collection);
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
    let items = mockDataService.list(collection);
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
    return mockDataService.getById(collection, id);
  }
  async create(collection, data) {
    return mockDataService.create(collection, data);
  }
  async update(collection, id, data) {
    return mockDataService.update(collection, id, data);
  }
  async delete(collection, id) {
    return mockDataService.delete(collection, id);
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
};
function createDataService() {
  if (env.USE_MOCK_DATA) {
    logger.info("[DataService] Using MockDataService");
    return new MockDataServiceAdapter();
  }
  logger.info("[DataService] Using FirebaseDataService");
  return new FirebaseDataService();
}
var dataService = createDataService();
function seedMockData(entities) {
  if (!env.USE_MOCK_DATA) {
    logger.info("[DataService] Mock mode disabled, skipping seed");
    return;
  }
  logger.info("[DataService] Seeding mock data...");
  for (const entity of entities) {
    mockDataService.seed(entity.name, entity.fields, entity.seedCount);
  }
  logger.info("[DataService] Mock data seeding complete");
}

export { dataService, mockDataService, seedMockData };
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map