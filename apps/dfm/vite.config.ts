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
    // Stated rather than left to Vite's default, because a second application
    // in this workspace has the same default: two apps silently competing for
    // one port is a confusing way to find that out.
    server: { port: 5173, strictPort: true },
    // Development only: mount the Hono API alongside Vite's SPA dev server on one origin.
    plugins: [
      tsconfigPaths(),
      tailwindcss(),
      reactRouter(),
      serverAdapter({ entry: 'server/index.ts' }),
    ],
  }
})
