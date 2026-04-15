// SPDX-License-Identifier: MIT
import { defineConfig } from 'vite';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
  root: resolve(__dirname, '..', 'fixtures'),
  server: {
    port: 5174,
    strictPort: true,
    host: 'localhost',
  },
  build: {
    outDir: resolve(__dirname, '.dist'),
    emptyOutDir: true,
  },
});
