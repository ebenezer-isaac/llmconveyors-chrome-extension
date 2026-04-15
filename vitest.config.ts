// vitest.config.ts
import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

const sharedAliases = {
  '@': resolve(__dirname, '.'),
  '~': resolve(__dirname, '.'),
  // Redirect the real webextension-polyfill to the in-memory fake so any
  // module that imports it during tests gets the mock. Required by
  // @webext-core/messaging and wxt/browser.
  'webextension-polyfill': '@webext-core/fake-browser',
};

export default defineConfig({
  resolve: {
    alias: sharedAliases,
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
        resolve: { alias: sharedAliases },
        test: {
          name: 'unit',
          include: [
            'tests/unit/**/*.spec.ts',
            'tests/unit/**/*.spec.tsx',
            'src/**/*.spec.ts',
          ],
          exclude: ['node_modules', '.wxt', '.output', 'dist', 'tests/harness/**'],
          environment: 'happy-dom',
          server: {
            deps: {
              inline: ['@webext-core/messaging'],
            },
          },
        },
      },
      {
        extends: true,
        resolve: { alias: sharedAliases },
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
