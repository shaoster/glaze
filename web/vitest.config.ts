import { defineConfig } from 'vitest/config'
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
    environment: 'jsdom',
    include: [
      'src/**/*.{test,spec}.{ts,tsx}',
      '../frontend_common/src/**/*.test.ts',
    ],
  },
})
