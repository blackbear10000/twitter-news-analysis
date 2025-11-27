import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: parseInt(process.env.VITE_PORT || '5173', 10),
    host: process.env.VITE_HOST || 'localhost',
  },
  preview: {
    port: parseInt(process.env.VITE_PREVIEW_PORT || '4173', 10),
    host: process.env.VITE_PREVIEW_HOST || 'localhost',
  },
})
