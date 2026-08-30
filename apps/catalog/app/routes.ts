import { index, route, type RouteConfig } from '@react-router/dev/routes'

export default [
  index('routes/home.tsx'),
  route('families', 'routes/families.tsx'),
  route('tools/:guid', 'routes/tool.tsx'),
  route('parts', 'routes/parts.tsx'),
  route('parts/:partId', 'routes/part.tsx'),
] satisfies RouteConfig
