import { index, route, type RouteConfig } from '@react-router/dev/routes'

/**
 * **The part is the application** (Paul, 2026-09-01).
 *
 * The catalog browser and the family list are still here and still work —
 * `/catalog` and `/families` — but nothing links to them: the way in is a
 * part, and a tool list with no part to cut is a different product. They are
 * hidden rather than deleted, so putting either back is a line in the header.
 */
export default [
  index('routes/parts.tsx', { id: 'start' }),
  route('catalog', 'routes/home.tsx'),
  route('families', 'routes/families.tsx'),
  route('tools/:guid', 'routes/tool.tsx'),
  route('parts', 'routes/parts.tsx'),
  route('parts/:partId', 'routes/part.tsx'),
  route('parts/:partId/order-list', 'routes/order-list.tsx'),
] satisfies RouteConfig
