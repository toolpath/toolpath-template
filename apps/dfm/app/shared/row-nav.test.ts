// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'

import {
  HOLDS,
  KEYNAV,
  ROW,
  focusedRow,
  keynavAttributes,
  listAt,
  meaningOf,
  rowAt,
  rowAttributes,
  rowsIn,
} from './row-nav'

afterEach(() => {
  document.body.innerHTML = ''
})

/** A list of marked rows, as a component would render one. */
const list = (name: string, rows: ReadonlyArray<{ value: string; holds?: Array<string> }>) => {
  const container = document.createElement('div')
  for (const [key, value] of Object.entries(keynavAttributes(name))) {
    container.setAttribute(key, value)
  }

  for (const row of rows) {
    const element = document.createElement('button')
    for (const [key, value] of Object.entries(rowAttributes(row.value, row.holds))) {
      if (value !== undefined) {
        element.setAttribute(key, value)
      }
    }
    container.append(element)
  }

  document.body.append(container)
  return container
}

describe('marking a row', () => {
  it('writes what the row stands for', () => {
    expect(rowAttributes('pocket-1')[ROW]).toBe('pocket-1')
  })

  /*
   * Absent and "just this one" are the same answer, so an ordinary row says
   * nothing — otherwise every reader has to handle a case that never differs.
   */
  it('says nothing about what it holds, for an ordinary row', () => {
    expect(rowAttributes('pocket-1')[HOLDS]).toBeUndefined()
    expect(rowAttributes('pocket-1', ['pocket-1'])[HOLDS]).toBeUndefined()
  })

  // A row for sixteen identical holes *is* sixteen, and a key pressed on it has
  // to be sixteen.
  it('lists them all, for a row that stands for a group', () => {
    expect(rowAttributes('hole-1', ['hole-1', 'hole-2', 'hole-3'])[HOLDS]).toBe(
      'hole-1 hole-2 hole-3',
    )
  })

  it('names the list a keyboard walks', () => {
    expect(keynavAttributes('faces')[KEYNAV]).toBe('faces')
  })
})

describe('reading a row back', () => {
  it('stands for itself, where it says nothing else', () => {
    const [row] = rowsIn(list('faces', [{ value: 'pocket-1' }]))

    expect(meaningOf(row)).toEqual({ value: 'pocket-1', holds: ['pocket-1'] })
  })

  it('stands for every reading it named, where it named several', () => {
    const [row] = rowsIn(list('holes', [{ value: 'hole-1', holds: ['hole-1', 'hole-2'] }]))

    expect(meaningOf(row)).toEqual({ value: 'hole-1', holds: ['hole-1', 'hole-2'] })
  })

  it('is nothing at all, for an element that is not a row', () => {
    expect(meaningOf(document.createElement('div'))).toBeNull()
    expect(meaningOf(null)).toBeNull()
  })

  // A row's value can be a face index, which is a number said as a string — and
  // `0` is falsy, which is the kind of thing that reads as "no row".
  it('reads a row whose value is zero', () => {
    const [row] = rowsIn(list('faces', [{ value: '0' }]))

    expect(meaningOf(row)).toEqual({ value: '0', holds: ['0'] })
  })
})

describe('finding the row and the list around something', () => {
  it('finds the row a click landed inside', () => {
    const container = list('faces', [{ value: 'pocket-1' }])
    const inner = document.createElement('span')
    container.querySelector(`[${ROW}]`)?.append(inner)

    expect(rowAt(inner)?.getAttribute(ROW)).toBe('pocket-1')
    expect(listAt(inner)?.getAttribute(KEYNAV)).toBe('faces')
  })

  it('finds nothing outside a list', () => {
    const loose = document.createElement('div')
    document.body.append(loose)

    expect(rowAt(loose)).toBeNull()
    expect(listAt(loose)).toBeNull()
  })

  it('walks the rows in the order they are on screen', () => {
    const container = list('faces', [{ value: 'a' }, { value: 'b' }, { value: 'c' }])

    expect(rowsIn(container).map((row) => row.getAttribute(ROW))).toEqual(['a', 'b', 'c'])
  })
})

describe('where the keyboard is', () => {
  it('says what the focused row stands for', () => {
    const container = list('holes', [{ value: 'hole-1', holds: ['hole-1', 'hole-2'] }])
    rowsIn(container)[0]?.focus()

    expect(focusedRow(document)).toEqual({ value: 'hole-1', holds: ['hole-1', 'hole-2'] })
  })

  /*
   * A real answer rather than a missing one: in by-direction mode a list can
   * take focus without any row being current, and the page has to be able to
   * tell that from "the row under the keyboard is this one".
   */
  it('says nothing where focus is not on a row', () => {
    list('faces', [{ value: 'a' }])
    document.body.focus()

    expect(focusedRow(document)).toBeNull()
  })
})
