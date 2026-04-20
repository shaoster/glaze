import { defineConfig } from 'vitest/config'
import { playwright } from '@vitest/browser-playwright'
import yaml from '@rollup/plugin-yaml'
import path from 'node:path'

export default defineConfig({
  plugins: [yaml()],
  resolve: {
    alias: [
      { find: /^@common\/(.*)/, replacement: path.resolve(__dirname, '../frontend_common/src/$1') },
      { find: 'axios', replacement: path.resolve(__dirname, 'node_modules/axios') },
    ],
  },
  server: {
    fs: {
      allow: ['..'],
    },
  },
  test: {
    setupFiles: ['./src/test-setup.ts'],
    globals: true,
    projects: [
      {
        extends: true,
        test: {
          name: 'jsdom',
          environment: 'jsdom',
          include: [
              'src/**/*.{test,spec}.{ts,tsx}',
              '../frontend_common/src/**/*.test.ts',
          ],
          exclude: ['src/App.test.tsx'], // Exclude App.test.tsx from jsdom tests
        },
      },
      {
        extends: true,
        test: {
          name: 'browser',
          environment: 'jsdom',
          include: ['src/App.test.tsx'], // Include App.test.tsx for browser tests
          browser: {
            headless: true,
            provider: playwright(),
            enabled: true,
            // at least one instance is required
            instances: [
              { browser: 'chromium' },
            ],
          },
        },
      }
    ]
  },
})
