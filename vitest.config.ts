// vitest.config.ts
import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, '.'),
      '~': resolve(__dirname, '.'),
    },
  },
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'json'],
      exclude: ['.wxt/**', '.output/**', 'node_modules/**', 'scripts/**', 'tests/**'],
      thresholds: {
        lines: 80,
        branches: 75,
        functions: 80,
        statements: 80,
      },
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.spec.ts', 'src/**/*.spec.ts'],
          exclude: ['node_modules', '.wxt', '.output', 'dist', 'tests/harness/**'],
          environment: 'happy-dom',
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.spec.ts'],
          exclude: ['node_modules', '.wxt', '.output', 'dist', 'tests/harness/**'],
          environment: 'happy-dom',
          testTimeout: 15_000,
        },
      },
    ],
  },
});
