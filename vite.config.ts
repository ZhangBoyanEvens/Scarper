import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiKey = env.DEEPSEEK_API_KEY
  const target = env.DEEPSEEK_API_BASE_URL || 'https://api.deepseek.com'

  const backendTarget =
    env.VITE_BACKEND_URL || 'http://127.0.0.1:8000'

  const proxy: Record<string, object> = {
    '/api/extract': { target: backendTarget, changeOrigin: true },
    '/api/health': { target: backendTarget, changeOrigin: true },
  }

  if (apiKey) {
    proxy['/api/deepseek'] = {
      target,
      changeOrigin: true,
      rewrite: (path: string) => path.replace(/^\/api\/deepseek/, ''),
      configure: (proxyServer: { on: Function }) => {
        proxyServer.on('proxyReq', (proxyReq: { setHeader: Function }) => {
          proxyReq.setHeader('Authorization', `Bearer ${apiKey}`)
        })
      },
    }
  }

  return {
    plugins: [react()],
    server: { proxy },
  }
})
