/**
 * Server EventBus - Singleton for server-side cross-trait communication
 *
 * This EventBus enables:
 * - Server-side trait event emission after CRUD operations
 * - Server-side trait listeners responding to events
 * - Cross-client event broadcast via WebSocket
 *
 * @packageDocumentation
 */

import type { LogMeta } from '@almadar/core';

/**
 * Event metadata type. Re-exports LogMeta from @almadar/core
 * so existing consumers importing EventMeta continue to work.
 */
export type EventMeta = LogMeta;

type EventHandler = (payload: unknown, meta?: EventMeta) => void;

export interface EventLogEntry {
  event: string;
  payload: unknown;
  timestamp: number;
  listenerCount: number;
  wildcardListenerCount: number;
}

const MAX_EVENT_LOG = 200;

/**
 * Simple EventBus implementation for server-side events
 */
export class EventBus {
  private handlers: Map<string, Set<EventHandler>> = new Map();
  private debug: boolean;
  private eventLog: EventLogEntry[] = [];

  constructor(options?: { debug?: boolean }) {
    this.debug = options?.debug ?? false;
  }

  on(event: string, handler: EventHandler): () => void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);

    // Return unsubscribe function
    return () => {
      this.handlers.get(event)?.delete(handler);
    };
  }

  off(event: string, handler: EventHandler): void {
    this.handlers.get(event)?.delete(handler);
  }

  emit(event: string, payload?: unknown, meta?: EventMeta): void {
    if (this.debug) {
      console.log(`[EventBus] Emitting ${event}:`, payload);
    }

    const handlers = this.handlers.get(event);
    const listenerCount = handlers?.size ?? 0;
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(payload, meta);
        } catch (err) {
          console.error(`[EventBus] Error in handler for ${event}:`, err);
        }
      });
    }

    // Wildcard subscribers receive all events (used by WebSocket broadcast)
    let wildcardListenerCount = 0;
    if (event !== '*') {
      const wildcardHandlers = this.handlers.get('*');
      wildcardListenerCount = wildcardHandlers?.size ?? 0;
      if (wildcardHandlers) {
        wildcardHandlers.forEach(handler => {
          try {
            handler({ type: event, payload, timestamp: Date.now() }, meta);
          } catch (err) {
            console.error(`[EventBus] Error in wildcard handler for ${event}:`, err);
          }
        });
      }
    }

    // Record event in log (dev diagnostics)
    if (this.debug) {
      this.eventLog.push({
        event,
        payload,
        timestamp: Date.now(),
        listenerCount,
        wildcardListenerCount,
      });
      if (this.eventLog.length > MAX_EVENT_LOG) {
        this.eventLog.splice(0, this.eventLog.length - MAX_EVENT_LOG);
      }
    }
  }

  getRecentEvents(limit = 50): EventLogEntry[] {
    return this.eventLog.slice(-limit);
  }

  clearEventLog(): void {
    this.eventLog.length = 0;
  }

  getListenerCounts(): Record<string, number> {
    const counts: Record<string, number> = {};
    this.handlers.forEach((handlers, event) => {
      counts[event] = handlers.size;
    });
    return counts;
  }

  clear(): void {
    this.handlers.clear();
    this.eventLog.length = 0;
  }
}

/**
 * Lazy singleton EventBus instance for server-side event communication.
 */
let _serverEventBus: EventBus | null = null;

export function getServerEventBus(): EventBus {
  if (!_serverEventBus) {
    _serverEventBus = new EventBus({
      debug: process.env.NODE_ENV === 'development',
    });
  }
  return _serverEventBus;
}

export function resetServerEventBus(): void {
  _serverEventBus?.clear();
  _serverEventBus = null;
}

/**
 * Type-safe event emission helper
 */
export function emitEntityEvent(
  entityType: string,
  action: 'CREATED' | 'UPDATED' | 'DELETED',
  payload: EventMeta
): void {
  const eventType = `${entityType.toUpperCase()}_${action}`;
  getServerEventBus().emit(eventType, payload, { orbital: entityType });
}
