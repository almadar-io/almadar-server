import { defineConfig } from 'tsup';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/lib/index.ts',
    'src/middleware/index.ts',
    'src/services/index.ts',
    'src/utils/index.ts',
  ],
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  splitting: false,
  treeshake: true,
  external: ['express', 'firebase-admin'],
});
