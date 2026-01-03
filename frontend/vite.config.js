import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  preview: {
    allowedHosts: [
      'llm-council-frontend-production.up.railway.app',
      '.up.railway.app',
      '.railway.internal',
      'localhost',
      '127.0.0.1',
    ],
  },
})
