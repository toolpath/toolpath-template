import { reactRouter } from '@react-router/dev/vite'
import tailwindcss from '@tailwindcss/vite'
import serverAdapter from 'hono-react-router-adapter/vite'
import { defineConfig, loadEnv } from 'vite'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig(({ mode }) => {
  Object.assign(process.env, loadEnv(mode, process.cwd(), ''))

  return {
    // Server configuration reads the environment explicitly above. Prevent Vite
    // from performing a second, client-oriented .env load.
    envDir: false,
    // Development only: mount the Hono API alongside Vite's SPA dev server on one origin.
    plugins: [
      tsconfigPaths(),
      tailwindcss(),
      reactRouter(),
      serverAdapter({ entry: 'server/index.ts' }),
    ],
  }
})
