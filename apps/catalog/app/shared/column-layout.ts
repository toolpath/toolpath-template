import { useCallback, useEffect, useRef, useState } from 'react'
import { orderedCodes } from './column-order'

/**
 * Which columns a list shows, and in what order — remembered per browser.
 *
 * **A shop sets its columns once** (Paul, 2026-09-11: "save column order and
 * visibility in local storage"). Cutting a thirteen-column list down to the
 * five somebody compares on, and dragging them into the order they read them
 * in, is a decision about how this shop works rather than about this part, and
 * it was thrown away on every reload.
 *
 * **This is the opposite call to the one made about column *widths* on the same
 * day, and the difference is what a stored answer is worth when the columns
 * change.** A width is stored as a track list positional in the columns that
 * existed when it was dragged, so hiding one silently re-applies every width to
 * the wrong column — the kit's own storage did exactly that, which is why this
 * application gives its tables no `id` to store under. What is stored here is
 * *codes*, so every stored answer still names the column it was about however
 * the catalog's column set moves under it.
 *
 * That is reconciliation, not luck, and {@link reconciled} is where it happens.
 */

/** A column, as far as this module needs to know one. */
export interface LayoutColumn {
  readonly code: string
  readonly default: boolean
}

export interface ColumnLayout {
  /** The codes not drawn. */
  readonly hidden: ReadonlyArray<string>
  /** Every code, in the order the table draws them. */
  readonly order: ReadonlyArray<string>
  /**
   * The codes somebody has decided for themselves.
   *
   * Tip angle and corner radius otherwise follow what is on the list —
   * `shared/auto-columns.ts` is that rule — and this is what stops the list
   * deciding about a column after somebody has. Stored with the rest, because
   * a hand-toggled tip angle that comes back off on the next reload is the
   * visibility this exists to keep.
   */
  readonly touched: ReadonlyArray<string>
}

/**
 * What is written down: the layout, plus the columns it was made about.
 *
 * `known` is the load-bearing field. Without it a column added to the catalog
 * after somebody saved a layout cannot be told apart from one they deliberately
 * left showing — so a new column that is meant to be off by default would come
 * on for everybody who had ever opened the picker, and stay on.
 */
interface Stored extends ColumnLayout {
  readonly known: ReadonlyArray<string>
}

const codes = (columns: ReadonlyArray<LayoutColumn>): Array<string> =>
  columns.map((column) => column.code)

/** The layout a browser that has never been here makes. */
export const defaultLayout = (columns: ReadonlyArray<LayoutColumn>): ColumnLayout => ({
  hidden: columns.filter((column) => !column.default).map((column) => column.code),
  order: codes(columns),
  touched: [],
})

const strings = (value: unknown): Array<string> =>
  Array.isArray(value) ? value.filter((each): each is string => typeof each === 'string') : []

/**
 * A stored layout, answered against the columns this build actually has.
 *
 * Three things can have changed between the write and the read, and each has
 * one honest answer:
 *
 * - **a column is gone** — drop it from all three lists, since a code nothing
 *   draws is an answer about nothing;
 * - **a column is new** — it takes its own default, which is what `known` is
 *   for, and it goes on the end of the order (`orderedCodes`, which neither
 *   drops it nor pretends somebody put it there); and
 * - **nothing changed** — the layout comes back exactly as it was left.
 */
export const reconciled = (
  stored: Partial<Stored>,
  columns: ReadonlyArray<LayoutColumn>,
): ColumnLayout => {
  const here = new Set(codes(columns))
  const known = new Set(strings(stored.known))
  const kept = strings(stored.hidden).filter((code) => here.has(code))
  const fresh = columns
    .filter((column) => !known.has(column.code) && !column.default && !kept.includes(column.code))
    .map((column) => column.code)
  return {
    hidden: [...kept, ...fresh],
    order: orderedCodes(codes(columns), strings(stored.order)),
    touched: strings(stored.touched).filter((code) => here.has(code)),
  }
}

/** What a key holds, or the columns' own defaults where it holds nothing usable. */
export const readLayout = (
  raw: string | null,
  columns: ReadonlyArray<LayoutColumn>,
): ColumnLayout => {
  if (raw === null || raw === '') {
    return defaultLayout(columns)
  }
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) {
      return defaultLayout(columns)
    }
    return reconciled(parsed as Partial<Stored>, columns)
  } catch {
    return defaultLayout(columns)
  }
}

/** The record to write: the layout, and the columns it was made about. */
export const written = (layout: ColumnLayout, columns: ReadonlyArray<LayoutColumn>): string =>
  JSON.stringify({ ...layout, known: codes(columns) } satisfies Stored)

/** Where each list's layout is kept. One key per list, because one list's columns are not another's. */
export const COLUMN_KEY = {
  tools: 'tool-catalog.columns.tools',
  taps: 'tool-catalog.columns.taps',
  holders: 'tool-catalog.columns.holders',
  collets: 'tool-catalog.columns.collets',
} as const

/**
 * One list's columns, remembered.
 *
 * **Read in an effect rather than in the initial state**, which is what the
 * rest of this application's stored preferences do: the catalog is built with
 * `ssr: false` but React Router still renders the shell once at build time, and
 * state that differs between that render and the browser's first one is a
 * hydration mismatch. The cost is that the defaults are drawn for one frame.
 *
 * @param key one of {@link COLUMN_KEY}.
 * @param columns every column this list can draw, in the order they are
 *   declared — the order a browser that has never been here gets.
 */
export const useColumnLayout = (key: string, columns: ReadonlyArray<LayoutColumn>) => {
  const [layout, setLayout] = useState<ColumnLayout>(() => defaultLayout(columns))
  /*
    Nothing is written until something has been read. Otherwise the first
    change of any kind — including the automatic one the tool list makes for
    tip angle and corner radius, which runs on the first list — would write the
    defaults over a real stored layout before the effect below had read it.
  */
  const loaded = useRef(false)

  useEffect(() => {
    setLayout(readLayout(globalThis.localStorage?.getItem(key) ?? null, columns))
    loaded.current = true
    // The columns of a given list are a module constant; the key is what says
    // which list this is.
  }, [key])

  const keep = useCallback(
    (next: (current: ColumnLayout) => ColumnLayout) => {
      setLayout((current) => {
        const settled = next(current)
        if (settled === current) {
          return current
        }
        if (loaded.current) {
          globalThis.localStorage?.setItem(key, written(settled, columns))
        }
        return settled
      })
    },
    [key, columns],
  )

  /** A column shown or hidden, and marked as somebody's own decision. */
  const toggle = useCallback(
    (code: string) => {
      keep((current) => ({
        ...current,
        hidden: current.hidden.includes(code)
          ? current.hidden.filter((each) => each !== code)
          : [...current.hidden, code],
        touched: current.touched.includes(code) ? current.touched : [...current.touched, code],
      }))
    },
    [keep],
  )

  const reorder = useCallback(
    (order: ReadonlyArray<string>) => {
      keep((current) => ({ ...current, order }))
    },
    [keep],
  )

  /**
   * The hidden set rewritten by a rule rather than by a press —
   * `hiddenAfterAuto`. Returning the same array leaves the stored layout
   * alone, which is what keeps a rule that decided nothing out of storage.
   */
  const setHidden = useCallback(
    (next: (hidden: ReadonlyArray<string>) => ReadonlyArray<string>) => {
      keep((current) => {
        const hidden = next(current.hidden)
        return hidden === current.hidden ? current : { ...current, hidden }
      })
    },
    [keep],
  )

  return { ...layout, toggle, reorder, setHidden }
}
