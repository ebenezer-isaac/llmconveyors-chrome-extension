// wxt.config.ts
import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  // Dev-only host_permissions are added via the `dev` field below; production
  // packages exclude localhost URLs so the extension cannot be tricked into
  // talking to a local attacker API if a developer leaves a rogue service
  // running.
  srcDir: '.',
  outDir: '.output',
  modules: ['@wxt-dev/module-react'],

  manifest: {
    name: '__MSG_appName__',
    description: '__MSG_appDescription__',
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
      'cookies',
      'downloads',
    ],
    host_permissions: [
      'https://*.greenhouse.io/*',
      'https://jobs.lever.co/*',
      'https://*.myworkdayjobs.com/*',
      'https://api.llmconveyors.com/*',
      'https://*.llmconveyors.com/*',
      'https://llmconveyors.com/*',
      // E2E fixture server. Only present when WXT_E2E=true so production
      // never ships with localhost permissions.
      ...(process.env.WXT_E2E === 'true' ? ['http://localhost:5174/*'] : []),
    ],
    content_security_policy: {
      // Lock the extension runtime: no remote scripts, no eval, no inline.
      // Chrome MV3 already enforces this by default but documenting it here
      // prevents accidental relaxation later.
      extension_pages: "script-src 'self'; object-src 'self'; base-uri 'self'",
    },
    action: {
      default_title: '__MSG_appName__',
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
    // Mirror the web app's NEXT_PUBLIC_* convention; WXT's own WXT_* prefix is
    // kept so internal WXT tooling still resolves.
    envPrefix: ['NEXT_PUBLIC_', 'WXT_', 'WXT_PUBLIC_'],
    build: {
      sourcemap: true,
      minify: 'esbuild',
      target: 'chrome120',
      // Disable Vite's module-preload helper entirely. The default helper
      // calls `document.createElement('link')` which crashes MV3 service
      // workers. `resolveDependencies: () => []` short-circuits dependency
      // resolution so the helper is never injected even when a shared chunk
      // has dynamic imports. See Vite #18551 and WXT #392.
      modulePreload: { polyfill: false, resolveDependencies: () => [] },
    },
  }),

  runner: {
    disabled: false,
  },
});
