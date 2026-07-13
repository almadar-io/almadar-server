/**
 * State Sync WebSocket Handler
 *
 * Provides real-time state synchronization using Socket.IO.
 * The DeepAgent state-sync manager has been removed; this is now a
 * lightweight pass-through that broadcasts events within a user's room.
 *
 * @packageDocumentation
 */

import { createLogger } from '@almadar/logger';
import { getAuth } from '../lib/db.js';

const syncLog = createLogger('almadar:server:websocket:statesync');

// Type definitions for Socket.IO (to avoid dependency)
interface Socket {
  data: { user: { uid: string; roles: string[]; orgId?: string } };
  handshake: { auth: { token: string; clientId: string } };
  join: (room: string) => void;
  leave: (room: string) => void;
  on: (event: string, handler: (...args: unknown[]) => void) => void;
  emit: (event: string, ...args: unknown[]) => void;
  to: (room: string) => { emit: (event: string, ...args: unknown[]) => void };
}

interface SocketServer {
  use: (middleware: (socket: Socket, next: (err?: Error) => void) => void) => void;
  on: (event: string, handler: (socket: Socket) => void) => void;
}

/**
 * Set up state sync WebSocket with Firebase Auth
 */
export async function setupStateSyncWebSocket(io: SocketServer): Promise<void> {
  // Firebase Auth middleware for Socket.IO
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token as string;
      if (!token) {
        return next(new Error('Authentication required'));
      }

      const decodedToken = await getAuth().verifyIdToken(token);
      const user = await getAuth().getUser(decodedToken.uid);

      socket.data.user = {
        uid: decodedToken.uid,
        roles: (user.customClaims?.roles as string[]) ?? ['user'],
        orgId: user.customClaims?.orgId as string,
      };

      next();
    } catch (error) {
      syncLog.error('Socket auth failed', { error: error instanceof Error ? error.message : String(error) });
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const userId = socket.data.user.uid;
    const clientId = socket.handshake.auth.clientId;

    syncLog.debug('Client connected', { clientId, userId });

    // Join user's room for targeted updates
    socket.join(`user:${userId}`);

    // Listen for state changes from client and broadcast to other clients
    socket.on('stateChange', (...args: unknown[]) => {
      const event = args[0] as { threadId: string };
      socket.to(`user:${userId}`).emit('remoteChange', event);
    });

    socket.on('disconnect', () => {
      syncLog.debug('Client disconnected', { clientId });
      socket.leave(`user:${userId}`);
    });
  });
}
