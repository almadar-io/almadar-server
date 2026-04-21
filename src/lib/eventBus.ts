/**
 * Server EventBus - Singleton for server-side cross-trait communication
 *
 * This EventBus enables:
 * - Server-side trait event emission after CRUD operations
 * - Server-side trait listeners responding to events
 * - Cross-client event broadcast via WebSocket
 *
 * Aligned with `@almadar/core`'s `BusEvent` envelope so generated server
 * code, generated client code, and `@almadar/ui`/`@almadar/runtime` all
 * share the same event shape. Listeners receive a single `BusEvent` arg
 * with `type`, `payload` (EventPayload), `timestamp`, and `source`
 * (BusEventSource).
 *
 * @packageDocumentation
 */

import type {
  BusEvent,
  BusEventListener,
  BusEventSource,
  EventPayload,
  Unsubscribe,
} from '@almadar/core';

export type { BusEvent, BusEventListener, BusEventSource, EventPayload, Unsubscribe };

export interface EventLogEntry {
  event: string;
  payload?: EventPayload;
  timestamp: number;
  listenerCount: number;
  wildcardListenerCount: number;
}

const MAX_EVENT_LOG = 200;

/**
 * Simple EventBus implementation for server-side events.
 * Every handler receives a single `BusEvent` so the signature matches
 * the client-side bus exactly.
 */
export class EventBus {
  private handlers: Map<string, Set<BusEventListener>> = new Map();
  private debug: boolean;
  private eventLog: EventLogEntry[] = [];

  constructor(options?: { debug?: boolean }) {
    this.debug = options?.debug ?? false;
  }

  on(event: string, handler: BusEventListener): Unsubscribe {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);

    return () => {
      this.handlers.get(event)?.delete(handler);
    };
  }

  off(event: string, handler: BusEventListener): void {
    this.handlers.get(event)?.delete(handler);
  }

  emit(event: string, payload?: EventPayload, source?: BusEventSource): void {
    const envelope: BusEvent = {
      type: event,
      payload,
      timestamp: Date.now(),
      source,
    };

    if (this.debug) {
      console.log(`[EventBus] Emitting ${event}:`, payload);
    }

    const handlers = this.handlers.get(event);
    const listenerCount = handlers?.size ?? 0;
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(envelope);
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
            handler(envelope);
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
        timestamp: envelope.timestamp,
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
 * Type-safe event emission helper for entity lifecycle events.
 * Stamps the source with the entity name as the orbital.
 */
export function emitEntityEvent(
  entityType: string,
  action: 'CREATED' | 'UPDATED' | 'DELETED',
  payload?: EventPayload
): void {
  const eventType = `${entityType.toUpperCase()}_${action}`;
  getServerEventBus().emit(eventType, payload, { orbital: entityType });
}
