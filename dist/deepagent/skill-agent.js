import { MemoryManager, SessionManager, getObservabilityCollector, getMultiUserManager, createWorkflowToolWrapper, createSkillAgent } from '@almadar/agent';
import admin from 'firebase-admin';

// src/deepagent/skill-agent.ts
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
var db = new Proxy({}, {
  get(_target, prop, receiver) {
    const firestore = getFirestore();
    const value = Reflect.get(firestore, prop, receiver);
    return typeof value === "function" ? value.bind(firestore) : value;
  }
});

// src/deepagent/memory.ts
var memoryManager = null;
function getMemoryManager() {
  if (!memoryManager) {
    memoryManager = new MemoryManager({
      db,
      usersCollection: "agent_memory_users",
      projectsCollection: "agent_memory_projects",
      generationsCollection: "agent_memory_generations",
      patternsCollection: "agent_memory_patterns",
      interruptsCollection: "agent_memory_interrupts",
      feedbackCollection: "agent_memory_feedback",
      checkpointsCollection: "agent_memory_checkpoints",
      toolPreferencesCollection: "agent_memory_tool_preferences"
    });
  }
  return memoryManager;
}
var sessionManager = null;
function createFirestoreAdapter(firestore) {
  return firestore;
}
function getSessionManager() {
  if (!sessionManager) {
    sessionManager = new SessionManager({
      mode: "firestore",
      firestoreDb: createFirestoreAdapter(db),
      memoryManager: getMemoryManager(),
      // Enable GAP-002D
      compactionConfig: {
        maxTokens: 15e4,
        keepRecentMessages: 10,
        strategy: "last"
      }
    });
  }
  return sessionManager;
}

// src/deepagent/skill-agent.ts
async function createServerSkillAgent(options) {
  const memoryManager2 = getMemoryManager();
  getSessionManager();
  const observability = getObservabilityCollector();
  const multiUser = getMultiUserManager();
  if (options.threadId) {
    const access = multiUser.canAccessSession(options.threadId, {
      userId: options.userId,
      roles: ["user"]
    });
    if (!access.allowed) {
      throw new Error(`Access denied: ${access.reason}`);
    }
  }
  observability.startSession(options.threadId ?? "new", options.userId);
  const workflowToolWrapper = createWorkflowToolWrapper({
    maxRetries: 2,
    enableTelemetry: true,
    timeoutMs: 3e5
    // 5 minutes
  });
  try {
    const result = await createSkillAgent({
      ...options,
      memoryManager: memoryManager2,
      // GAP-001: Enable memory
      userId: options.userId,
      // GAP-002D: Session → Memory sync
      appId: options.appId,
      toolWrapper: workflowToolWrapper.wrap
      // Always use workflow wrapper for reliability
    });
    if (result.threadId) {
      multiUser.assignSessionOwnership(result.threadId, options.userId);
    }
    observability.recordEvent({
      type: "session_start",
      sessionId: result.threadId,
      userId: options.userId,
      payload: { skill: options.skill }
    });
    return result;
  } catch (error) {
    observability.recordError(options.threadId ?? "new", error);
    throw error;
  }
}

export { createServerSkillAgent, getMemoryManager, getSessionManager };
//# sourceMappingURL=skill-agent.js.map
//# sourceMappingURL=skill-agent.js.map