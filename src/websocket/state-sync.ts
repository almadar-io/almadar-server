/**
 * State Sync WebSocket Handler
 *
 * Provides real-time state synchronization using Socket.IO.
 *
 * @packageDocumentation
 */

import { getStateSyncManager } from '@almadar/agent';
import { getMultiUserManager } from '@almadar/agent';
import { getAuth } from '../lib/db.js';

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
export function setupStateSyncWebSocket(io: SocketServer): void {
  const stateSync = getStateSyncManager();

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
      console.error('Socket auth failed:', error);
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const userId = socket.data.user.uid;
    const clientId = socket.handshake.auth.clientId;

    console.log(`[StateSync] Client ${clientId} connected for user ${userId}`);

    // Update client ID in sync manager
    stateSync.updateConfig({ clientId });

    // Join user's room for targeted updates
    socket.join(`user:${userId}`);

    // Listen for state changes from client
    socket.on('stateChange', (...args: unknown[]) => {
      const event = args[0] as { threadId: string };
      
      // Verify ownership
      const multiUser = getMultiUserManager();
      if (!multiUser.isSessionOwner(event.threadId, userId)) {
        socket.emit('error', { message: 'Not session owner' });
        return;
      }

      // Process through sync manager
      stateSync.receiveRemoteChange(event as unknown as import('@almadar/agent').StateChangeEvent);

      // Broadcast to other clients of same user
      socket.to(`user:${userId}`).emit('remoteChange', event);
    });

    // Handle sync required events from agent
    stateSync.on('syncRequired', (changes: unknown[]) => {
      socket.emit('syncBatch', changes);
    });

    socket.on('disconnect', () => {
      console.log(`[StateSync] Client ${clientId} disconnected`);
      socket.leave(`user:${userId}`);
    });
  });
}
