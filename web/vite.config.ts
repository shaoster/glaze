import { defineConfig } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import yaml from '@rollup/plugin-yaml'
import { fileURLToPath } from 'node:url'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    yaml(),
    react(),
    babel({ presets: [reactCompilerPreset()] })
  ],
  resolve: {
    alias: {
      '@common': fileURLToPath(new URL('../frontend_common/src', import.meta.url)),
    },
  },
  server: {
    fs: {
      allow: ['..'],
    },
    proxy: {
      '/api': 'http://localhost:8080',
    },
  },
})
