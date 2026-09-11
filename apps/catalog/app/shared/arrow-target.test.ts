import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  COMPONENT_LIST,
  TOOL_LIST,
  arrowTarget,
  focusList,
  handToList,
  insideList,
  readFirstRow,
} from './arrow-target'

describe('arrowTarget', () => {
  it('is nobody’s while nothing is being asked', () => {
    expect(arrowTarget({ boxOpen: false, inList: false, readingARow: false })).toBeNull()
    expect(arrowTarget({ boxOpen: false, inList: true, readingARow: true })).toBeNull()
  })

  it('stands down for a list that has the focus and a row to move from', () => {
    expect(arrowTarget({ boxOpen: true, inList: true, readingARow: true })).toBeNull()
  })

  it('hands the press to a list that has not got the focus', () => {
    expect(arrowTarget({ boxOpen: true, inList: false, readingARow: true })).toBe('list')
  })

  it('answers a list reading no row, focus or no focus', () => {
    expect(arrowTarget({ boxOpen: true, inList: true, readingARow: false })).toBe('list')
    expect(arrowTarget({ boxOpen: true, inList: false, readingARow: false })).toBe('list')
  })
})

afterEach(() => {
  document.body.replaceChildren()
})

/** A list on screen: the kit's focusable container, and rows inside it. */
const mountList = (attribute: string, rows: number): HTMLElement => {
  const list = document.createElement('div')
  list.setAttribute(attribute.slice(1, -1), 'true')
  const container = document.createElement('div')
  container.setAttribute('tabindex', '0')
  list.append(container)
  for (let index = 0; index < rows; index += 1) {
    const row = document.createElement('div')
    row.setAttribute('data-row-index', String(index))
    container.append(row)
  }
  document.body.append(list)
  return list
}

describe('insideList', () => {
  it('knows a press inside either list from one outside both', () => {
    const tools = mountList(TOOL_LIST, 1)
    const rack = mountList(COMPONENT_LIST, 1)
    const elsewhere = document.createElement('canvas')
    document.body.append(elsewhere)

    expect(insideList(tools.querySelector('[data-row-index]'))).toBe(true)
    expect(insideList(rack.querySelector('[data-row-index]'))).toBe(true)
    expect(insideList(elsewhere)).toBe(false)
    expect(insideList(null)).toBe(false)
  })
})

describe('focusList', () => {
  it('focuses the kit’s own container rather than the wrapper', () => {
    const tools = mountList(TOOL_LIST, 2)

    expect(focusList(TOOL_LIST)).toBe(true)
    expect(document.activeElement).toBe(tools.querySelector('[tabindex="0"]'))
  })

  it('says so when there is no list on screen', () => {
    expect(focusList(TOOL_LIST)).toBe(false)
  })
})

describe('readFirstRow', () => {
  it('clicks the first row the list draws', () => {
    const tools = mountList(TOOL_LIST, 2)
    const clicked = vi.fn()
    tools.querySelector('[data-row-index="0"]')?.addEventListener('click', clicked)
    tools.querySelector('[data-row-index="1"]')?.addEventListener('click', clicked)

    readFirstRow(TOOL_LIST)

    expect(clicked).toHaveBeenCalledTimes(1)
  })
})

describe('handToList', () => {
  it('lands on the first row where the list is reading none', () => {
    const tools = mountList(TOOL_LIST, 2)
    const clicked = vi.fn()
    tools.querySelector('[data-row-index="0"]')?.addEventListener('click', clicked)

    expect(handToList(TOOL_LIST, false)).toBe(true)
    expect(document.activeElement).toBe(tools.querySelector('[tabindex="0"]'))
    expect(clicked).toHaveBeenCalledTimes(1)
  })

  it('leaves the row being read alone', () => {
    const tools = mountList(TOOL_LIST, 2)
    const clicked = vi.fn()
    tools.querySelector('[data-row-index="0"]')?.addEventListener('click', clicked)

    handToList(TOOL_LIST, true)

    expect(clicked).not.toHaveBeenCalled()
  })
})
