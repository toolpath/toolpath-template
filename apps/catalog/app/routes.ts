import { index, route, type RouteConfig } from '@react-router/dev/routes'

export default [
  index('routes/parts.tsx', { id: 'start' }),
  route('parts', 'routes/parts.tsx'),
  route('parts/:partId', 'routes/part.tsx'),
  route('parts/:partId/order-list', 'routes/order-list.tsx'),
] satisfies RouteConfig
