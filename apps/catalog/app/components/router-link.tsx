import { Link } from 'react-router'
import type { LinkComponentProps } from '@toolpath/ui'

/**
 * What `@toolpath/ui` renders an anchor as.
 *
 * An external link keeps the plain anchor: React Router's `Link` would treat
 * an absolute vendor URL as a route and navigate to a path that does not
 * exist.
 */
export const RouterLink = ({ href, ref, ...props }: LinkComponentProps) => {
  if (!href || /^[a-z]+:/i.test(href) || href.startsWith('//')) {
    return <a href={href} ref={ref} {...props} />
  }
  return <Link to={href} ref={ref} {...props} />
}
