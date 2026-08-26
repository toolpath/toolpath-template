import type { ReactNode } from 'react'

/**
 * One control in the viewport's toolbar.
 *
 * The label does three jobs: the tooltip, the accessible name, and the only
 * description of what the icon means. An icon-only control that says nothing to
 * a screen reader is a control only some people have.
 *
 * Toggles carry `aria-pressed`, so "on" is announced rather than only coloured
 * — the same reason the pressed state changes the border and not just the fill.
 */
export const ToolButton = ({
  label,
  pressed,
  onClick,
  children,
}: {
  label: string
  pressed?: boolean
  onClick: () => void
  children: ReactNode
}) => (
  <button
    type="button"
    title={label}
    aria-label={label}
    aria-pressed={pressed}
    onClick={onClick}
    className={`grid size-6 place-items-center rounded transition ${
      pressed ? 'bg-info/20 text-info' : 'text-ink-muted hover:bg-surface hover:text-ink'
    } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info/75`}
  >
    {children}
  </button>
)
