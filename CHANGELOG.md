# @almadar/server

## 1.4.1

### Patch Changes

- Updated dependencies
  - @almadar/agent@1.6.0

## 1.2.0

### Minor Changes

- Add GAP integration exports for builder server:
  - getMemoryManager, resetMemoryManager from deepagent/memory
  - getSessionManager, resetSessionManager from deepagent/session
  - createServerSkillAgent from deepagent/skill-agent
  - multiUserMiddleware, verifyFirebaseAuth from middleware/multi-user
  - setupStateSyncWebSocket from websocket/state-sync
  - observabilityRouter from routes/observability

  Adds tsup entry points for all deepagent modules.

### Patch Changes

- Updated dependencies
  - @almadar/agent@1.2.0
