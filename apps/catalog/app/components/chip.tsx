import { Button, cn } from '@toolpath/ui'
import type { CSSProperties, ReactNode } from 'react'

/**
 * The small pressed-or-not control this application is made of.
 *
 * Modes, presets, passes, units, colouring — nearly every control here is the
 * same shape of question: one of these, or this on or off. They were each
 * styled where they were written, so the page read as five toolbars from five
 * applications. This is that control, once.
 *
 * **Pressed is a fill, not a border.** At this size a border change is a
 * one-pixel difference somebody has to look for, and the whole point of these
 * is being read at a glance from across a panel.
 */
export interface ChipProps {
  readonly children: ReactNode
  readonly pressed?: boolean
  readonly onClick?: () => void
  readonly disabled?: boolean
  readonly title?: string
  readonly label?: string
  /**
   * The colour pressed wears, where the control has a colour of its own.
   *
   * Roughing and finishing do: a row's button and the face it paints have to be
   * obviously the same claim. Everything else takes the accent.
   */
  readonly color?: string
  readonly className?: string
}

export const Chip = ({
  children,
  pressed = false,
  onClick,
  disabled = false,
  title,
  label,
  color,
  className,
}: ChipProps) => {
  const style: CSSProperties | undefined =
    pressed && color ? { background: color, borderColor: color } : undefined

  return (
    <Button
      type="button"
      variant="muted"
      size="sm"
      aria-pressed={pressed}
      aria-label={label}
      title={title}
      disabled={disabled}
      onClick={onClick}
      style={style}
      className={cn(
        'text-2xs inline-flex items-center gap-1 rounded border px-1.5 py-0.5 transition',
        'focus-visible:ring-info/60 focus-visible:ring-1 focus-visible:outline-none',
        disabled && 'cursor-not-allowed opacity-40',
        pressed && color && 'text-zinc-950',
        pressed && !color && 'border-info/60 bg-info/20 text-info',
        !pressed && 'border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200',
        className,
      )}
    >
      {children}
    </Button>
  )
}

/** A row of chips that answer one question between them. */
export const ChipGroup = ({
  label,
  children,
  className,
}: {
  label: string
  children: ReactNode
  className?: string
}) => (
  <span
    className={cn('flex flex-wrap items-center gap-1', className)}
    role="group"
    aria-label={label}
  >
    {children}
  </span>
)
