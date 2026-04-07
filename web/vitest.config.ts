import { defineConfig } from 'vitest/config'
import yaml from '@rollup/plugin-yaml'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

export default defineConfig({
  plugins: [yaml()],
  esbuild: {
    jsx: 'automatic',
  },
  resolve: {
    alias: {
      axios: path.resolve(__dirname, 'node_modules/axios'),
      '@common': fileURLToPath(new URL('../frontend_common/src', import.meta.url)),
    },
  },
  server: {
    fs: {
      allow: ['..'],
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    globals: true,
    include: [
      'src/**/*.{test,spec}.{ts,tsx}',
      '../frontend_common/src/**/*.test.ts',
    ],
  },
})
