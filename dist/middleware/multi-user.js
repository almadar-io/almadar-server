import { createUserContext, getMultiUserManager } from '@almadar/agent';
import admin from 'firebase-admin';

// src/middleware/multi-user.ts
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

// src/middleware/multi-user.ts
async function multiUserMiddleware(req, res, next) {
  const userId = req.user?.uid;
  if (!userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  req.userContext = createUserContext(userId, {
    orgId: req.user?.orgId,
    roles: req.user?.roles ?? ["user"]
  });
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (body && typeof body === "object" && "threadId" in body) {
      const multiUser = getMultiUserManager();
      multiUser.assignSessionOwnership(
        body.threadId,
        userId
      );
    }
    return originalJson(body);
  };
  next();
}
async function verifyFirebaseAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "No token provided" });
    return;
  }
  const token = authHeader.split("Bearer ")[1];
  try {
    const decodedToken = await getAuth().verifyIdToken(token);
    const user = await getAuth().getUser(decodedToken.uid);
    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email,
      roles: user.customClaims?.roles ?? ["user"],
      orgId: user.customClaims?.orgId
    };
    next();
  } catch (error) {
    console.error("Token verification failed:", error);
    res.status(401).json({ error: "Invalid token" });
  }
}

export { multiUserMiddleware, verifyFirebaseAuth };
//# sourceMappingURL=multi-user.js.map
//# sourceMappingURL=multi-user.js.map