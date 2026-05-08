import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron/simple'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      '@':            path.resolve(__dirname, 'renderer'),
      '@/app':        path.resolve(__dirname, 'renderer/app'),
      '@/features':   path.resolve(__dirname, 'renderer/features'),
      '@/components': path.resolve(__dirname, 'renderer/components'),
      '@/layouts':    path.resolve(__dirname, 'renderer/layouts'),
      '@/hooks':      path.resolve(__dirname, 'renderer/hooks'),
      '@/services':   path.resolve(__dirname, 'renderer/services'),
      '@/stores':     path.resolve(__dirname, 'renderer/stores'),
      '@/schemas':    path.resolve(__dirname, 'renderer/schemas'),
      '@/lib':        path.resolve(__dirname, 'renderer/lib'),
      '@/types':      path.resolve(__dirname, 'renderer/types'),
    },
  },
  plugins: [
    react(),
    electron({
      main: {
        entry: 'main/index.js',
        vite: {
          build: {
            rollupOptions: {
              external: ['better-sqlite3'],
            },
          },
        },
      },
      preload: {
        input: 'main/preload.js',
      },
    }),
  ],
})
