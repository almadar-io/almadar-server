/**
 * WebSocket Event Broadcast - Cross-client event synchronization
 *
 * Broadcasts server-side events to all connected clients via WebSocket.
 * This enables real-time updates across multiple browser clients.
 *
 * @packageDocumentation
 */
import { WebSocketServer } from 'ws';
import type { Server } from 'http';
/**
 * Setup WebSocket server for event broadcasting.
 *
 * Listens to all server events via wildcard and broadcasts to connected clients.
 *
 * @param server - HTTP server to attach WebSocket to
 * @param path - WebSocket endpoint path (default: '/ws/events')
 *
 * @example
 * ```typescript
 * import { createServer } from 'http';
 * import { setupEventBroadcast } from '@/lib/websocket';
 *
 * const server = createServer(app);
 * setupEventBroadcast(server);
 * ```
 */
export declare function setupEventBroadcast(server: Server, path?: string): WebSocketServer;
/**
 * Get the WebSocket server instance (for testing or advanced usage)
 */
export declare function getWebSocketServer(): WebSocketServer | null;
/**
 * Close the WebSocket server
 */
export declare function closeWebSocketServer(): Promise<void>;
/**
 * Get connected client count
 */
export declare function getConnectedClientCount(): number;
//# sourceMappingURL=websocket.d.ts.map