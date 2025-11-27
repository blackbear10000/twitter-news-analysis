import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // Set the third parameter to '' to load all env regardless of the `VITE_` prefix.
  const env = loadEnv(mode, process.cwd(), '')

  // Vite uses PORT by default, but we also support VITE_PORT
  const port = env.PORT || env.VITE_PORT || '5173'
  const host = env.VITE_HOST || 'localhost'
  const previewPort = env.VITE_PREVIEW_PORT || '4173'
  const previewHost = env.VITE_PREVIEW_HOST || 'localhost'
  const allowedHostsRaw = env.VITE_ALLOWED_HOSTS || env.ALLOWED_HOSTS || ''
  const allowedHosts = allowedHostsRaw
    .split(',')
    .map((host) => host.trim())
    .filter(Boolean)

  return {
    plugins: [react()],
    server: {
      port: parseInt(port, 10),
      host: host,
      strictPort: true, // Fail fast if the port is already in use
      allowedHosts: allowedHosts.length ? allowedHosts : undefined,
    },
    preview: {
      port: parseInt(previewPort, 10),
      host: previewHost,
      allowedHosts: allowedHosts.length ? allowedHosts : undefined,
      strictPort: true,
    },
  }
})
