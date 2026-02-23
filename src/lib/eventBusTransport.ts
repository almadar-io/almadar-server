/**
 * EventBus Transport Layer — Pluggable backends for distributed event communication
 *
 * Transports enable emit/listen to work across processes:
 * - InMemoryTransport: Default, same-process (no-op relay)
 * - RedisTransport: Redis pub/sub for cross-process communication
 *
 * The DistributedEventBus wraps the existing EventBus and relays events
 * through a transport. Local listeners still fire immediately; the transport
 * handles cross-process delivery.
 *
 * @packageDocumentation
 */

import { EventBus, type EventLogEntry } from './eventBus.js';

// ============================================================================
// Transport Interface
// ============================================================================

/**
 * Message shape sent over the transport wire.
 */
export interface TransportMessage {
  event: string;
  payload: unknown;
  meta?: Record<string, unknown>;
  /** Source instance ID to prevent echo loops */
  sourceId: string;
  timestamp: number;
}

/**
 * Callback invoked when a message arrives from another process.
 */
export type TransportReceiver = (message: TransportMessage) => void;

/**
 * Pluggable transport interface for cross-process event delivery.
 */
export interface IEventBusTransport {
  /** Publish a message to the transport */
  publish(message: TransportMessage): Promise<void>;
  /** Subscribe to incoming messages from other processes */
  subscribe(receiver: TransportReceiver): Promise<void>;
  /** Unsubscribe and clean up resources */
  close(): Promise<void>;
}

// ============================================================================
// InMemoryTransport (default — same-process, no network)
// ============================================================================

/**
 * No-op transport for single-process mode.
 * Events stay in the local EventBus only.
 */
export class InMemoryTransport implements IEventBusTransport {
  async publish(): Promise<void> {
    // No-op: events only live in the local EventBus
  }

  async subscribe(): Promise<void> {
    // No-op: nothing to subscribe to
  }

  async close(): Promise<void> {
    // No-op
  }
}

// ============================================================================
// RedisTransport (cross-process via Redis pub/sub)
// ============================================================================

/**
 * Options for RedisTransport.
 */
export interface RedisTransportOptions {
  /** Redis channel name for event relay (default: 'almadar:events') */
  channel?: string;
  /**
   * Publish function — sends serialized message to Redis channel.
   * This is injected so we don't depend on a specific Redis client library.
   */
  publishFn: (channel: string, message: string) => Promise<void>;
  /**
   * Subscribe function — registers a callback for messages on a Redis channel.
   * This is injected so we don't depend on a specific Redis client library.
   */
  subscribeFn: (channel: string, callback: (message: string) => void) => Promise<void>;
  /**
   * Unsubscribe/cleanup function.
   */
  closeFn?: () => Promise<void>;
}

/**
 * Redis pub/sub transport for cross-process event delivery.
 *
 * Uses dependency-injected publish/subscribe functions so the transport
 * is not coupled to any specific Redis client library (ioredis, redis, etc.).
 *
 * Usage with ioredis:
 * ```typescript
 * import Redis from 'ioredis';
 * const pub = new Redis(process.env.REDIS_URL);
 * const sub = new Redis(process.env.REDIS_URL);
 *
 * const transport = new RedisTransport({
 *   publishFn: (ch, msg) => pub.publish(ch, msg).then(() => {}),
 *   subscribeFn: (ch, cb) => { sub.subscribe(ch); sub.on('message', (_, msg) => cb(msg)); return Promise.resolve(); },
 *   closeFn: async () => { await pub.quit(); await sub.quit(); },
 * });
 * ```
 */
export class RedisTransport implements IEventBusTransport {
  private channel: string;
  private publishFn: RedisTransportOptions['publishFn'];
  private subscribeFn: RedisTransportOptions['subscribeFn'];
  private closeFn: RedisTransportOptions['closeFn'];

  constructor(options: RedisTransportOptions) {
    this.channel = options.channel ?? 'almadar:events';
    this.publishFn = options.publishFn;
    this.subscribeFn = options.subscribeFn;
    this.closeFn = options.closeFn;
  }

  async publish(message: TransportMessage): Promise<void> {
    const serialized = JSON.stringify(message);
    await this.publishFn(this.channel, serialized);
  }

  async subscribe(receiver: TransportReceiver): Promise<void> {
    await this.subscribeFn(this.channel, (raw: string) => {
      try {
        const message = JSON.parse(raw) as TransportMessage;
        receiver(message);
      } catch {
        console.error('[RedisTransport] Failed to parse message:', raw);
      }
    });
  }

  async close(): Promise<void> {
    if (this.closeFn) {
      await this.closeFn();
    }
  }
}

// ============================================================================
// DistributedEventBus
// ============================================================================

let instanceCounter = 0;

/**
 * DistributedEventBus wraps the existing EventBus and relays events
 * through a pluggable transport for cross-process communication.
 *
 * - Local emit → fires local listeners + publishes to transport
 * - Transport message received → fires local listeners (skips re-publish)
 *
 * Drop-in replacement for EventBus — same API, same singleton pattern.
 */
export class DistributedEventBus {
  private localBus: EventBus;
  private transport: IEventBusTransport;
  private instanceId: string;
  private isRelaying = false;

  constructor(options?: {
    debug?: boolean;
    transport?: IEventBusTransport;
  }) {
    this.localBus = new EventBus({ debug: options?.debug });
    this.transport = options?.transport ?? new InMemoryTransport();
    this.instanceId = `instance_${++instanceCounter}_${Date.now()}`;
  }

  /**
   * Initialize the transport subscription. Call once at startup.
   */
  async connect(): Promise<void> {
    await this.transport.subscribe((message) => {
      // Skip messages from ourselves (echo prevention)
      if (message.sourceId === this.instanceId) {
        return;
      }

      // Relay to local bus without re-publishing to transport
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
  emit(event: string, payload?: unknown, meta?: Record<string, unknown>): void {
    // Always fire locally
    this.localBus.emit(event, payload, meta);

    // Publish to transport (unless this emit was triggered by a transport relay)
    if (!this.isRelaying) {
      const message: TransportMessage = {
        event,
        payload,
        meta,
        sourceId: this.instanceId,
        timestamp: Date.now(),
      };
      // Fire-and-forget publish (don't block the emit)
      this.transport.publish(message).catch((err) => {
        console.error('[DistributedEventBus] Transport publish error:', err);
      });
    }
  }

  /** Subscribe to an event */
  on(event: string, handler: (payload: unknown, meta?: Record<string, unknown>) => void): () => void {
    return this.localBus.on(event, handler);
  }

  /** Unsubscribe from an event */
  off(event: string, handler: (payload: unknown, meta?: Record<string, unknown>) => void): void {
    this.localBus.off(event, handler);
  }

  /** Get recent events (dev diagnostics) */
  getRecentEvents(limit?: number): EventLogEntry[] {
    return this.localBus.getRecentEvents(limit);
  }

  /** Clear event log */
  clearEventLog(): void {
    this.localBus.clearEventLog();
  }

  /** Get listener counts */
  getListenerCounts(): Record<string, number> {
    return this.localBus.getListenerCounts();
  }

  /** Clear all listeners and log */
  clear(): void {
    this.localBus.clear();
  }

  /** Disconnect transport */
  async disconnect(): Promise<void> {
    await this.transport.close();
  }

  /** Get the instance ID (for debugging) */
  getInstanceId(): string {
    return this.instanceId;
  }
}
