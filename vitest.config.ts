import {defineConfig} from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'scripts',
          environment: 'node',
          include: ['scripts/test/**/*.test.mjs'],
        },
      },
      {
        test: {
          name: 'unit',
          environment: 'node',
          include: ['packages/*/test/unit/**/*.test.ts', 'packages/*/test/unit/**/*.test.tsx'],
          setupFiles: ['packages/remotion-mushaf-line-renderer/test/setup.ts'],
        },
      },
      {
        test: {
          name: 'render',
          environment: 'node',
          include: ['packages/*/test/render/**/*.test.ts'],
          testTimeout: 600_000,
          hookTimeout: 600_000,
        },
      },
    ],
  },
});
