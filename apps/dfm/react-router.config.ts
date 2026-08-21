import type { Config } from '@react-router/dev/config'

export default {
  // The browser owns all UI state. Hono only handles the API and secure Engine session.
  ssr: false,
} satisfies Config
