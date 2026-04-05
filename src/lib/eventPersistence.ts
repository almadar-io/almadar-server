/**
 * Event Persistence Layer — Optional durable event storage for replay and debugging
 *
 * Wraps the EventBus to persist emitted events. Supports:
 * - In-memory storage (default, for development)
 * - Configurable retention (TTL-based cleanup)
 * - Replay API: query events by name, time range, or source
 * - Required for saga compensation and distributed debugging
 *
 * @packageDocumentation
 */

// ============================================================================
// Types
// ============================================================================

/** Persisted event record */
export interface PersistedEvent {
  /** Unique event ID */
  id: string;
  /** Event name (e.g., 'LLM_RESPONSE') */
  eventName: string;
  /** Event payload */
  payload: unknown;
  /** Source orbital/service that emitted this event */
  source: string;
  /** Timestamp when event was emitted */
  timestamp: number;
  /** Trace ID for distributed tracing correlation */
  traceId: string;
  /** Optional metadata */
  meta?: { [key: string]: string | number | boolean | null | undefined };
}

/** Query filters for replaying events */
export interface EventQuery {
  /** Filter by event name (exact match) */
  eventName?: string;
  /** Filter by source orbital */
  source?: string;
  /** Filter by trace ID */
  traceId?: string;
  /** Events after this timestamp */
  after?: number;
  /** Events before this timestamp */
  before?: number;
  /** Maximum number of events to return */
  limit?: number;
  /** Sort order */
  order?: 'asc' | 'desc';
}

/** Options for the event persistence layer */
export interface EventPersistenceOptions {
  /** Whether persistence is enabled (default: true) */
  enabled?: boolean;
  /** TTL in milliseconds for event retention (default: 24 hours) */
  retentionMs?: number;
  /** Maximum events to store (default: 10000) */
  maxEvents?: number;
  /** Cleanup interval in milliseconds (default: 5 minutes) */
  cleanupIntervalMs?: number;
  /** Default source identifier */
  defaultSource?: string;
}

/** Storage backend interface */
export interface IEventStore {
  /** Persist an event */
  store(event: PersistedEvent): Promise<void>;
  /** Query events */
  query(filters: EventQuery): Promise<PersistedEvent[]>;
  /** Get a single event by ID */
  get(id: string): Promise<PersistedEvent | null>;
  /** Delete events older than timestamp */
  deleteOlderThan(timestamp: number): Promise<number>;
  /** Get total event count */
  count(): Promise<number>;
  /** Clear all stored events */
  clear(): Promise<void>;
}

// ============================================================================
// InMemoryEventStore
// ============================================================================

/**
 * In-memory event store for development and testing.
 */
export class InMemoryEventStore implements IEventStore {
  private events: PersistedEvent[] = [];
  private index: Map<string, PersistedEvent> = new Map();

  async store(event: PersistedEvent): Promise<void> {
    this.events.push(event);
    this.index.set(event.id, event);
  }

  async query(filters: EventQuery): Promise<PersistedEvent[]> {
    let results = this.events;

    if (filters.eventName) {
      results = results.filter(e => e.eventName === filters.eventName);
    }
    if (filters.source) {
      results = results.filter(e => e.source === filters.source);
    }
    if (filters.traceId) {
      results = results.filter(e => e.traceId === filters.traceId);
    }
    if (filters.after !== undefined) {
      results = results.filter(e => e.timestamp > filters.after!);
    }
    if (filters.before !== undefined) {
      results = results.filter(e => e.timestamp < filters.before!);
    }

    // Sort
    if (filters.order === 'desc') {
      results = [...results].reverse();
    }

    // Limit
    if (filters.limit !== undefined && filters.limit > 0) {
      results = results.slice(0, filters.limit);
    }

    return results;
  }

  async get(id: string): Promise<PersistedEvent | null> {
    return this.index.get(id) ?? null;
  }

  async deleteOlderThan(timestamp: number): Promise<number> {
    const before = this.events.length;
    this.events = this.events.filter(e => e.timestamp >= timestamp);

    // Rebuild index
    this.index.clear();
    for (const event of this.events) {
      this.index.set(event.id, event);
    }

    return before - this.events.length;
  }

  async count(): Promise<number> {
    return this.events.length;
  }

  async clear(): Promise<void> {
    this.events = [];
    this.index.clear();
  }
}

// ============================================================================
// EventPersistence
// ============================================================================

let idCounter = 0;

/**
 * Event persistence layer that can be attached to an EventBus.
 *
 * Usage:
 * ```typescript
 * const persistence = new EventPersistence({ retentionMs: 3600000 });
 * persistence.startCleanup();
 *
 * // Persist an event
 * await persistence.persist('LLM_RESPONSE', { content: '...' }, { source: 'llm-service' });
 *
 * // Replay events
 * const events = await persistence.replay({ eventName: 'LLM_RESPONSE', limit: 10 });
 *
 * // Stop cleanup on shutdown
 * persistence.stopCleanup();
 * ```
 */
export class EventPersistence {
  private store: IEventStore;
  private options: Required<EventPersistenceOptions>;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(options?: EventPersistenceOptions, store?: IEventStore) {
    this.options = {
      enabled: options?.enabled ?? true,
      retentionMs: options?.retentionMs ?? 24 * 60 * 60 * 1000, // 24 hours
      maxEvents: options?.maxEvents ?? 10000,
      cleanupIntervalMs: options?.cleanupIntervalMs ?? 5 * 60 * 1000, // 5 minutes
      defaultSource: options?.defaultSource ?? 'unknown',
    };
    this.store = store ?? new InMemoryEventStore();
  }

  /**
   * Persist an event.
   */
  async persist(
    eventName: string,
    payload: unknown,
    meta?: { source?: string; traceId?: string; [key: string]: unknown },
  ): Promise<PersistedEvent> {
    const event: PersistedEvent = {
      id: `evt_${++idCounter}_${Date.now()}`,
      eventName,
      payload,
      source: meta?.source ?? this.options.defaultSource,
      timestamp: Date.now(),
      traceId: meta?.traceId ?? `trace_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      meta: meta ? { ...meta } : undefined,
    };

    if (this.options.enabled) {
      await this.store.store(event);
    }

    return event;
  }

  /**
   * Replay events matching the query filters.
   */
  async replay(query: EventQuery): Promise<PersistedEvent[]> {
    return this.store.query(query);
  }

  /**
   * Get a single event by ID.
   */
  async getEvent(id: string): Promise<PersistedEvent | null> {
    return this.store.get(id);
  }

  /**
   * Get event count.
   */
  async getEventCount(): Promise<number> {
    return this.store.count();
  }

  /**
   * Run cleanup — delete events older than retention period.
   */
  async cleanup(): Promise<number> {
    const cutoff = Date.now() - this.options.retentionMs;
    return this.store.deleteOlderThan(cutoff);
  }

  /**
   * Start periodic cleanup timer.
   */
  startCleanup(): void {
    if (this.cleanupTimer) return;
    this.cleanupTimer = setInterval(() => {
      this.cleanup().catch(err => {
        console.error('[EventPersistence] Cleanup error:', err);
      });
    }, this.options.cleanupIntervalMs);
  }

  /**
   * Stop periodic cleanup timer.
   */
  stopCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * Clear all persisted events.
   */
  async clear(): Promise<void> {
    await this.store.clear();
  }

  /**
   * Get the underlying store (for testing or custom queries).
   */
  getStore(): IEventStore {
    return this.store;
  }
}
