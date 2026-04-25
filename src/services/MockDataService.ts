/**
 * MockDataService - In-memory data store with faker-based mock generation
 *
 * Provides a stateful mock data layer that supports all CRUD operations.
 * Uses @faker-js/faker for realistic data generation based on field types.
 *
 * @packageDocumentation
 */

import type { EntityRow, FieldValue } from '@almadar/core';
import { faker } from '@faker-js/faker';
import { env } from '../lib/env.js';
import { logger } from '../lib/logger.js';

// ============================================================================
// Types
// ============================================================================

export interface FieldSchema {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'date' | 'enum' | 'relation' | 'array';
  required?: boolean;
  enumValues?: string[];
  min?: number;
  max?: number;
  fakerMethod?: string;
  relatedEntity?: string;
  /**
   * Declared default value from the .orb schema. When present, the mock
   * generator returns this verbatim instead of a faker-generated random,
   * matching `@almadar/runtime`'s MockPersistenceAdapter behavior. The
   * special string `"@now"` resolves to the current ISO timestamp.
   */
  default?: string | number | boolean;
}

export interface EntitySchema {
  fields: FieldSchema[];
  seedCount?: number;
}

interface BaseEntity {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// MockDataService
// ============================================================================

/**
 * In-memory mock data store with CRUD operations and faker-based seeding.
 */
export class MockDataService {
  private stores: Map<string, Map<string, unknown>> = new Map();
  private schemas: Map<string, EntitySchema> = new Map();
  private idCounters: Map<string, number> = new Map();

  constructor() {
    // Set seed for deterministic generation if provided
    if (env.MOCK_SEED !== undefined) {
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
  private getStore(entityName: string): Map<string, unknown> {
    const normalized = entityName.toLowerCase();
    if (!this.stores.has(normalized)) {
      this.stores.set(normalized, new Map());
      this.idCounters.set(normalized, 0);
    }
    return this.stores.get(normalized)!;
  }

  /**
   * Generate next ID for an entity.
   */
  private nextId(entityName: string): string {
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
  registerSchema(entityName: string, schema: EntitySchema): void {
    this.schemas.set(entityName.toLowerCase(), schema);
  }

  /**
   * Seed an entity with mock data.
   */
  seed(entityName: string, fields: FieldSchema[], count: number = 10): void {
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
  private generateMockItem(entityName: string, fields: FieldSchema[], index: number): BaseEntity & EntityRow {
    const id = this.nextId(entityName);
    const now = new Date();
    const item: EntityRow = {
      id,
      createdAt: faker.date.past({ years: 1 }),
      updatedAt: now,
    };

    for (const field of fields) {
      if (field.name === 'id' || field.name === 'createdAt' || field.name === 'updatedAt') {
        continue;
      }
      const value = this.generateFieldValue(entityName, field, index);
      if (value !== undefined) {
        item[field.name] = value as FieldValue;
      }
    }

    return item as BaseEntity & EntityRow;
  }

  /**
   * Generate a mock value for a field based on its schema.
   */
  private generateFieldValue(entityName: string, field: FieldSchema, index: number): unknown {
    // Honor the schema-declared default first — matches
    // `@almadar/runtime`'s MockPersistenceAdapter so a field declared
    // `tokenCount : number = 0` shows 0 in compiled-path screenshots
    // instead of a faker random. `@now` is the conventional ISO-time
    // sentinel used elsewhere in the runtime.
    if (field.default !== undefined) {
      if (field.default === '@now') {
        return new Date().toISOString();
      }
      return field.default;
    }

    // Handle optional fields - 80% chance of having a value
    if (!field.required && Math.random() > 0.8) {
      return undefined;
    }

    switch (field.type) {
      case 'string':
        return this.generateStringValue(entityName, field, index);

      case 'number':
        return faker.number.int({
          min: field.min ?? 0,
          max: field.max ?? 1000,
        });

      case 'boolean':
        return faker.datatype.boolean();

      case 'date':
        return this.generateDateValue(field);

      case 'enum':
        if (field.enumValues && field.enumValues.length > 0) {
          return faker.helpers.arrayElement(field.enumValues);
        }
        return null;

      case 'relation':
        // For relations, generate a placeholder ID or null
        if (field.relatedEntity) {
          const relatedStore = this.stores.get(field.relatedEntity.toLowerCase());
          if (relatedStore && relatedStore.size > 0) {
            const ids = Array.from(relatedStore.keys());
            return faker.helpers.arrayElement(ids);
          }
        }
        return null;

      case 'array':
        // Generate an empty array for now
        return [];

      default:
        return null;
    }
  }

  /**
   * Generate a string value based on field name heuristics.
   * Generic name/title fields use a clean readable format (e.g., "Title 1").
   * Specific fields (email, phone, etc.) use faker.
   */
  private generateStringValue(_entityName: string, field: FieldSchema, index: number): string {
    const name = field.name.toLowerCase();

    // If field has enumValues, use them (even if type is 'string')
    if (field.enumValues && field.enumValues.length > 0) {
      return faker.helpers.arrayElement(field.enumValues);
    }

    // Identity fields
    if (name.includes('email')) return faker.internet.email();
    if (name === 'name' || name === 'fullname' || name === 'full_name') return faker.person.fullName();
    if (name === 'firstname' || name === 'first_name') return faker.person.firstName();
    if (name === 'lastname' || name === 'last_name') return faker.person.lastName();
    if (name.includes('username') || name === 'handle') return faker.internet.username();

    // Contact fields
    if (name.includes('phone') || name.includes('mobile') || name.includes('tel')) return faker.phone.number();
    if (name.includes('address') || name.includes('street')) return faker.location.streetAddress();
    if (name.includes('city')) return faker.location.city();
    if (name.includes('state') || name.includes('province')) return faker.location.state();
    if (name.includes('country')) return faker.location.country();
    if (name.includes('zip') || name.includes('postal')) return faker.location.zipCode();

    // Content fields
    if (name === 'title' || name === 'headline' || name === 'subject') return faker.lorem.sentence({ min: 3, max: 7 }).replace(/\.$/, '');
    if (name === 'description' || name === 'summary' || name === 'bio' || name === 'about') return faker.lorem.paragraph(2);
    if (name === 'content' || name === 'body' || name === 'text') return faker.lorem.paragraphs(2);
    if (name === 'excerpt' || name === 'snippet' || name === 'preview') return faker.lorem.sentence({ min: 8, max: 15 });
    if (name === 'label' || name === 'tag' || name === 'category') return faker.word.noun();
    if (name === 'note' || name === 'comment' || name === 'message' || name === 'feedback') return faker.lorem.sentence();

    // Status / type fields
    if (name === 'status') return faker.helpers.arrayElement(['active', 'pending', 'completed', 'draft', 'archived']);
    if (name === 'priority') return faker.helpers.arrayElement(['low', 'medium', 'high', 'critical']);
    if (name === 'type' || name === 'kind') return faker.helpers.arrayElement(['standard', 'premium', 'basic', 'custom']);
    if (name === 'role') return faker.helpers.arrayElement(['admin', 'editor', 'viewer', 'member']);
    if (name === 'level' || name === 'tier') return faker.helpers.arrayElement(['beginner', 'intermediate', 'advanced', 'expert']);
    if (name === 'severity') return faker.helpers.arrayElement(['info', 'warning', 'error', 'critical']);
    if (name === 'difficulty') return faker.helpers.arrayElement(['easy', 'medium', 'hard']);

    // Web / media fields
    if (name.includes('url') || name.includes('website') || name.includes('link')) return faker.internet.url();
    if (name.includes('avatar') || name.includes('image') || name.includes('photo') || name.includes('thumbnail')) return faker.image.avatar();
    if (name.includes('color') || name.includes('colour')) return faker.color.human();
    if (name.includes('uuid') || name === 'guid') return faker.string.uuid();
    if (name.includes('icon')) return faker.helpers.arrayElement(['star', 'heart', 'check', 'alert-circle', 'info', 'folder', 'file', 'user']);
    if (name === 'slug') return faker.helpers.slugify(faker.lorem.words(3));

    // Organization / business fields
    if (name === 'company' || name === 'organization' || name === 'org') return faker.company.name();
    if (name === 'department') return faker.commerce.department();
    if (name === 'product' || name === 'productname' || name === 'product_name') return faker.commerce.productName();
    if (name === 'brand') return faker.company.name();
    if (name === 'sku' || name === 'code') return faker.string.alphanumeric(8).toUpperCase();
    if (name === 'currency') return faker.finance.currencyCode();
    if (name.includes('price') || name.includes('cost') || name.includes('amount')) return faker.commerce.price();

    // Location / geo fields
    if (name === 'latitude' || name === 'lat') return String(faker.location.latitude());
    if (name === 'longitude' || name === 'lng' || name === 'lon') return String(faker.location.longitude());
    if (name === 'location' || name === 'place' || name === 'venue') return `${faker.location.city()}, ${faker.location.country()}`;
    if (name === 'region' || name === 'zone' || name === 'area') return faker.location.state();

    // Technical fields
    if (name === 'ip' || name.includes('ipaddress') || name === 'ip_address') return faker.internet.ip();
    if (name === 'useragent' || name === 'user_agent') return faker.internet.userAgent();
    if (name === 'version' || name === 'firmware') return faker.system.semver();
    if (name === 'platform' || name === 'os') return faker.helpers.arrayElement(['iOS', 'Android', 'Windows', 'macOS', 'Linux']);
    if (name === 'browser') return faker.helpers.arrayElement(['Chrome', 'Firefox', 'Safari', 'Edge']);

    // Measurement / unit fields
    if (name === 'unit') return faker.helpers.arrayElement(['kg', 'lb', 'cm', 'm', 'L', 'mL', '°C', '°F', 'psi', 'rpm']);
    if (name === 'metric') return faker.helpers.arrayElement(['temperature', 'pressure', 'humidity', 'speed', 'voltage']);
    if (name === 'operator') return faker.helpers.arrayElement(['gt', 'lt', 'eq', 'gte', 'lte']);
    if (name === 'format' || name === 'mimetype' || name === 'mime_type') return faker.system.mimeType();
    if (name === 'extension' || name === 'ext') return faker.system.fileExt();
    if (name === 'filename' || name === 'file_name') return faker.system.fileName();

    // Fallback: generate realistic data based on common suffixes and patterns
    if (name.endsWith('id') || name.endsWith('_id')) return faker.string.alphanumeric(8).toUpperCase();
    if (name.endsWith('name') || name.endsWith('_name')) return faker.person.fullName();
    if (name.endsWith('type') || name.endsWith('_type')) return faker.helpers.arrayElement(['standard', 'premium', 'basic', 'custom', 'special']);
    if (name.endsWith('date') || name.endsWith('_date') || name.endsWith('at')) return faker.date.recent({ days: 90 }).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    if (name.endsWith('count') || name.endsWith('_count')) return String(faker.number.int({ min: 1, max: 100 }));
    if (name.includes('reason') || name.includes('detail')) return faker.lorem.sentence({ min: 4, max: 8 }).replace(/\.$/, '');
    if (name.includes('field') || name.includes('key') || name.includes('attribute')) return faker.word.noun();
    if (name.includes('value') || name.includes('result') || name.includes('output')) return faker.word.words({ count: { min: 1, max: 3 } });
    if (name.includes('direction') || name.includes('position') || name.includes('mode')) return faker.helpers.arrayElement(['left', 'right', 'center', 'top', 'bottom', 'auto']);
    // Generic fallback: short descriptive phrase
    return faker.word.words({ count: { min: 1, max: 3 } });
  }

  /**
   * Capitalize first letter of a string.
   */
  private capitalizeFirst(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  /**
   * Generate a date value based on field name heuristics.
   */
  private generateDateValue(field: FieldSchema): Date {
    const name = field.name.toLowerCase();

    if (name.includes('created') || name.includes('start') || name.includes('birth')) {
      return faker.date.past({ years: 2 });
    }
    if (name.includes('updated') || name.includes('modified')) {
      return faker.date.recent({ days: 30 });
    }
    if (name.includes('deadline') || name.includes('due') || name.includes('end') || name.includes('expires')) {
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
  list<T>(entityName: string): T[] {
    const store = this.getStore(entityName);
    return Array.from(store.values()) as T[];
  }

  /**
   * Get a single item by ID.
   */
  getById<T>(entityName: string, id: string): T | null {
    const store = this.getStore(entityName);
    const item = store.get(id);
    return (item as T) ?? null;
  }

  /**
   * Create a new item.
   */
  create<T extends BaseEntity>(entityName: string, data: Partial<T>): T {
    const store = this.getStore(entityName);
    const id = this.nextId(entityName);
    const now = new Date();

    const item = {
      ...data,
      id,
      createdAt: now,
      updatedAt: now,
    } as T;

    store.set(id, item);
    return item;
  }

  /**
   * Update an existing item.
   */
  update<T extends BaseEntity>(entityName: string, id: string, data: Partial<T>): T | null {
    const store = this.getStore(entityName);
    const existing = store.get(id);

    if (!existing) {
      return null;
    }

    const updated = {
      ...(existing as T),
      ...data,
      id, // Preserve original ID
      updatedAt: new Date(),
    } as T;

    store.set(id, updated);
    return updated;
  }

  /**
   * Delete an item.
   */
  delete(entityName: string, id: string): boolean {
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
  clear(entityName: string): void {
    const normalized = entityName.toLowerCase();
    this.stores.delete(normalized);
    this.idCounters.delete(normalized);
  }

  /**
   * Clear all data.
   */
  clearAll(): void {
    this.stores.clear();
    this.idCounters.clear();
  }

  /**
   * Get count of items for an entity.
   */
  count(entityName: string): number {
    const store = this.getStore(entityName);
    return store.size;
  }
}

// Lazy singleton instance
let _mockDataService: MockDataService | null = null;

export function getMockDataService(): MockDataService {
  if (!_mockDataService) {
    _mockDataService = new MockDataService();
  }
  return _mockDataService;
}

export function resetMockDataService(): void {
  _mockDataService?.clearAll();
  _mockDataService = null;
}
