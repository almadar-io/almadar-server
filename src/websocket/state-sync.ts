/**
 * State Sync WebSocket Handler
 *
 * Provides real-time state synchronization using Socket.IO.
 *
 * @packageDocumentation
 */

import type { Server as SocketServer } from 'socket.io';
import { getStateSyncManager } from '@almadar/agent';
import { getMultiUserManager } from '@almadar/agent';
import { getAuth } from '../lib/db.js';

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

  io.on('connection', (socket) => {
    const userId = socket.data.user.uid as string;
    const clientId = socket.handshake.auth.clientId as string;

    console.log(`[StateSync] Client ${clientId} connected for user ${userId}`);

    // Update client ID in sync manager
    stateSync.updateConfig({ clientId });

    // Join user's room for targeted updates
    socket.join(`user:${userId}`);

    // Listen for state changes from client
    socket.on('stateChange', (event) => {
      // Verify ownership
      const multiUser = getMultiUserManager();
      if (!multiUser.isSessionOwner(event.threadId, userId)) {
        socket.emit('error', { message: 'Not session owner' });
        return;
      }

      // Process through sync manager
      stateSync.receiveRemoteChange(event);

      // Broadcast to other clients of same user
      socket.to(`user:${userId}`).emit('remoteChange', event);
    });

    // Handle sync required events from agent
    stateSync.on('syncRequired', (changes) => {
      socket.emit('syncBatch', changes);
    });

    socket.on('disconnect', () => {
      console.log(`[StateSync] Client ${clientId} disconnected`);
      socket.leave(`user:${userId}`);
    });
  });
}
