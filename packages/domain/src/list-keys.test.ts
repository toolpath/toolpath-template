// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { moveThroughList } from './list-keys.js'

const list = (count: number) => {
  const container = document.createElement('div')
  for (let at = 0; at < count; at += 1) {
    const row = document.createElement('button')
    row.dataset.row = `row-${at}`
    container.append(row)
  }
  document.body.append(container)
  return { container, rows: [...container.querySelectorAll('button')] }
}

const press = (
  key: string,
  container: HTMLElement,
  target: HTMLElement,
  actions = {},
): { handled: boolean; prevented: boolean } => {
  let prevented = false
  const handled = moveThroughList(
    { key, target, currentTarget: container, preventDefault: () => (prevented = true) },
    actions,
  )
  return { handled, prevented }
}

describe('moveThroughList', () => {
  it('walks straight down and up the rows on screen', () => {
    const { container, rows } = list(3)
    rows[0]!.focus()

    press('ArrowDown', container, rows[0]!)
    expect(document.activeElement).toBe(rows[1])

    press('ArrowUp', container, rows[1]!)
    expect(document.activeElement).toBe(rows[0])
  })

  it('stops at the ends rather than wrapping', () => {
    const { container, rows } = list(2)

    // A list that wraps takes somebody who held the key down back to the top
    // without them noticing they ever reached the bottom.
    press('ArrowUp', container, rows[0]!)
    expect(document.activeElement).toBe(rows[0])

    press('ArrowDown', container, rows[1]!)
    expect(document.activeElement).toBe(rows[1])
  })

  it('jumps to either end', () => {
    const { container, rows } = list(4)

    press('End', container, rows[0]!)
    expect(document.activeElement).toBe(rows[3])

    press('Home', container, rows[3]!)
    expect(document.activeElement).toBe(rows[0])
  })

  it('opens and closes a group, as a tree does', () => {
    const { container, rows } = list(2)
    const onOpen = vi.fn()
    const onClose = vi.fn()

    press('ArrowRight', container, rows[1]!, { onOpen, onClose })
    expect(onOpen).toHaveBeenCalledWith('row-1')

    press('ArrowLeft', container, rows[1]!, { onOpen, onClose })
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('leaves every other key alone, so typing in the list still works', () => {
    const { container, rows } = list(2)

    expect(press('a', container, rows[0]!).handled).toBe(false)
    expect(press('Enter', container, rows[0]!).handled).toBe(false)
    expect(press('ArrowDown', container, rows[0]!).prevented).toBe(true)
  })

  it('ignores a key pressed somewhere that is not a row', () => {
    const { container } = list(2)
    const search = document.createElement('input')
    container.prepend(search)

    expect(press('ArrowDown', container, search).handled).toBe(false)
  })
})
