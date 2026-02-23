import { defineConfig } from 'tsup';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/lib/index.ts',
    'src/middleware/index.ts',
    'src/services/index.ts',
    'src/stores/index.ts',
    'src/utils/index.ts',
    'src/deepagent/memory.ts',
    'src/deepagent/session.ts',
    'src/deepagent/skill-agent.ts',
    'src/middleware/multi-user.ts',
    'src/websocket/state-sync.ts',
    'src/routes/observability.ts',
  ],
  format: ['esm'],
  dts: false,
  clean: true,
  sourcemap: true,
  splitting: false,
  treeshake: true,
  external: ['express', 'firebase-admin'],
});
