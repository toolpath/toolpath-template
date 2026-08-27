import type { ReactNode } from 'react'
import { classNames } from 'shared/class-names'

export const AppHeader = ({
  children,
  navigation,
  actions,
  className = '',
}: {
  children: ReactNode
  navigation?: ReactNode
  actions?: ReactNode
  className?: string
}) => (
  <header className={classNames('flex flex-wrap items-center justify-between gap-3', className)}>
    <div className="flex min-w-0 items-center gap-8">
      <div className="shrink-0">{children}</div>
      {navigation ? <div className="min-w-0">{navigation}</div> : null}
    </div>
    {actions ? <div className="shrink-0">{actions}</div> : null}
  </header>
)
