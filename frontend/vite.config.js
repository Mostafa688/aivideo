import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react({ babel: { parserOpts: { plugins: [] } } })],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3001',
      '/outputs': 'http://localhost:3001',
    },
  },
})