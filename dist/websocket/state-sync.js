import { getStateSyncManager, getMultiUserManager } from '@almadar/agent';
import admin from 'firebase-admin';

// src/websocket/state-sync.ts
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
function getAuth() {
  return getApp().auth();
}
new Proxy({}, {
  get(_target, prop, receiver) {
    const firestore = getFirestore();
    const value = Reflect.get(firestore, prop, receiver);
    return typeof value === "function" ? value.bind(firestore) : value;
  }
});

// src/websocket/state-sync.ts
function setupStateSyncWebSocket(io) {
  const stateSync = getStateSyncManager();
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) {
        return next(new Error("Authentication required"));
      }
      const decodedToken = await getAuth().verifyIdToken(token);
      const user = await getAuth().getUser(decodedToken.uid);
      socket.data.user = {
        uid: decodedToken.uid,
        roles: user.customClaims?.roles ?? ["user"],
        orgId: user.customClaims?.orgId
      };
      next();
    } catch (error) {
      console.error("Socket auth failed:", error);
      next(new Error("Invalid token"));
    }
  });
  io.on("connection", (socket) => {
    const userId = socket.data.user.uid;
    const clientId = socket.handshake.auth.clientId;
    console.log(`[StateSync] Client ${clientId} connected for user ${userId}`);
    stateSync.updateConfig({ clientId });
    socket.join(`user:${userId}`);
    socket.on("stateChange", (...args) => {
      const event = args[0];
      const multiUser = getMultiUserManager();
      if (!multiUser.isSessionOwner(event.threadId, userId)) {
        socket.emit("error", { message: "Not session owner" });
        return;
      }
      stateSync.receiveRemoteChange(event);
      socket.to(`user:${userId}`).emit("remoteChange", event);
    });
    stateSync.on("syncRequired", (changes) => {
      socket.emit("syncBatch", changes);
    });
    socket.on("disconnect", () => {
      console.log(`[StateSync] Client ${clientId} disconnected`);
      socket.leave(`user:${userId}`);
    });
  });
}

export { setupStateSyncWebSocket };
//# sourceMappingURL=state-sync.js.map
//# sourceMappingURL=state-sync.js.map