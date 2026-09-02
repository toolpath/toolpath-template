import { ROW, rowAt, rowsIn } from './row-nav'

/**
 * Arrow keys through a list of rows.
 *
 * The rows are found in the DOM rather than tracked in state, so a list that
 * grows a nested group under one of its rows needs nothing here: what is on
 * screen in document order is what the keyboard walks, which is the order
 * somebody reading it expects.
 *
 * Down and up move; Home and End jump; Right opens a group and Left closes it,
 * matching how a tree behaves everywhere else. Anything else is left alone —
 * typing into a search box inside the list has to keep working.
 */
export interface ListKeyActions {
  /** Called for Right on a row that can open, with the row's own value. */
  onOpen?: (value: string) => void
  /**
   * Called for Left, to close whatever is open, with the row's own value.
   *
   * Left knows which row it is on, and a list with two kinds of openable row —
   * a face that opens onto its readings, a hole group that opens onto its holes
   * — has to be told which one is being closed, or closing the inner one takes
   * the outer one with it.
   */
  onClose?: (value: string) => void
}

export const moveThroughList = (
  event: {
    key: string
    target: EventTarget | null
    currentTarget: EventTarget | null
    preventDefault: () => void
  },
  actions: ListKeyActions = {},
): boolean => {
  const container = event.currentTarget as HTMLElement | null
  const target = event.target as HTMLElement | null
  if (!container || !target) {
    return false
  }

  const rows = rowsIn(container)
  const at = rows.indexOf(rowAt(target) ?? target)
  if (at === -1) {
    return false
  }

  const focus = (index: number) => {
    const row = rows[Math.min(Math.max(index, 0), rows.length - 1)]
    row?.focus()
  }

  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault()
      focus(at + 1)
      return true
    case 'ArrowUp':
      event.preventDefault()
      focus(at - 1)
      return true
    case 'Home':
      event.preventDefault()
      focus(0)
      return true
    case 'End':
      event.preventDefault()
      focus(rows.length - 1)
      return true
    case 'ArrowRight': {
      const value = rows[at]?.getAttribute(ROW)
      if (!value || !actions.onOpen) {
        return false
      }
      event.preventDefault()
      actions.onOpen(value)
      return true
    }
    case 'ArrowLeft': {
      if (!actions.onClose) {
        return false
      }
      event.preventDefault()
      actions.onClose(rows[at]?.getAttribute(ROW) ?? '')
      return true
    }
    default:
      return false
  }
}
