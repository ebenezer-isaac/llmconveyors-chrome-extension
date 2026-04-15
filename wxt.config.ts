// wxt.config.ts
import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  srcDir: '.',
  outDir: '.output',
  modules: ['@wxt-dev/module-react'],

  manifest: {
    name: 'LLM Conveyors Job Assistant',
    description:
      'Intelligent form autofill and keyword highlighting for Greenhouse, Lever, and Workday job applications.',
    version: '0.1.0',
    default_locale: 'en',
    minimum_chrome_version: '114',
    author: { email: 'ebnezr.isaac@gmail.com' },
    homepage_url: 'https://github.com/ebenezer-isaac/llmconveyors-chrome-extension',
    permissions: [
      'activeTab',
      'storage',
      'identity',
      'scripting',
      'sidePanel',
      'notifications',
    ],
    host_permissions: [
      'https://*.greenhouse.io/*',
      'https://jobs.lever.co/*',
      'https://*.myworkdayjobs.com/*',
      'https://api.llmconveyors.com/*',
      'https://llmconveyors.com/*',
    ],
    action: {
      default_title: 'LLM Conveyors Job Assistant',
      default_icon: {
        '16': '/icon/16.png',
        '32': '/icon/32.png',
        '48': '/icon/48.png',
        '128': '/icon/128.png',
      },
    },
    icons: {
      '16': '/icon/16.png',
      '32': '/icon/32.png',
      '48': '/icon/48.png',
      '128': '/icon/128.png',
    },
  },

  vite: () => ({
    plugins: [tailwindcss()],
    build: {
      sourcemap: true,
      minify: 'esbuild',
      target: 'chrome120',
    },
  }),

  runner: {
    disabled: false,
  },
});
