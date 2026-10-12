import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { loadEnv } from 'vite'
import { createTotpViteMiddleware } from './server/vite-totp-middleware.js'

export default defineConfig(({ mode }) => {
  const serverEnv = loadEnv(mode, process.cwd(), '')
  Object.entries(serverEnv).forEach(([name, value]) => {
    if (process.env[name] === undefined) process.env[name] = value
  })

  return {
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'greenroom-totp-dev-api',
      apply: 'serve',
      configureServer(server) {
        server.middlewares.use(createTotpViteMiddleware())
      },
    },
  ],
  }
})
