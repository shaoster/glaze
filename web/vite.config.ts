import { defineConfig } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import yaml from '@rollup/plugin-yaml'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

// https://vite.dev/config/
export default defineConfig({
  resolve: {
    // frontend_common is outside web/, so bare imports inside it resolve from
    // the repo root upward (not web/node_modules). Pin axios to web's install.
    alias: {
      axios: path.resolve(__dirname, 'node_modules/axios'),
      '@common': fileURLToPath(new URL('../frontend_common/src', import.meta.url)),
    },
  },
  plugins: [
    yaml(),
    react(),
    babel({ presets: [reactCompilerPreset()] })
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) {
            return 'vendor-react'
          }
          if (id.includes('node_modules/@mui') || id.includes('node_modules/@emotion')) {
            return 'vendor-mui'
          }
        },
      },
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
