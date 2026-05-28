import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react({ babel: { parserOpts: { plugins: [] } } })],
  build: {
    rollupOptions: {
      output: {
        entryFileNames: `assets/index-[hash]-${Date.now()}.js`,
        chunkFileNames: `assets/index-[hash]-${Date.now()}.js`,
        assetFileNames: (info) => info.name?.endsWith('.css')
          ? `assets/index-[hash]-${Date.now()}.[ext]`
          : `assets/[name]-[hash].[ext]`,
      }
    }
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3001',
      '/outputs': 'http://localhost:3001',
    },
  },
})