import { defineConfig } from 'vitest/config'
import yaml from '@rollup/plugin-yaml'

export default defineConfig({
  plugins: [yaml()],
  esbuild: {
    jsx: 'automatic',
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    globals: true,
  },
})
