import { MemoryManager } from '@almadar/agent';
import admin from 'firebase-admin';

// src/deepagent/memory.ts
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
function resetMemoryManager() {
  memoryManager = null;
}

export { getMemoryManager, resetMemoryManager };
//# sourceMappingURL=memory.js.map
//# sourceMappingURL=memory.js.map