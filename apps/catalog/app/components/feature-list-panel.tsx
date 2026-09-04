import { cn } from '@toolpath/ui'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  CaretDownIcon,
  CaretRightIcon,
  FolderIcon,
  FolderOpenIcon,
  PlusIcon,
} from '@phosphor-icons/react'
import { formatGeometry } from 'shared/geometry'
import type { UnitSystem } from '@toolpath/tool-support'
import { labelOf, type ListItem } from 'shared/feature-list'
import type { Pick, RecommendationRow } from 'shared/recommendations'
import { ToolTypeIcon } from './tool-icons'

/**
 * The features somebody has asked about, as a list they built.
 *
 * **The selection was invisible** (Paul, 2026-09-02). Clicking a face put its
 * hole group into the page's kept set and the tool list was judged against
 * everything in it, with nothing on screen saying what "everything" was — so
 * the answer to "what tool cuts this pocket" could quietly be an answer about
 * four holes and a slot as well.
 *
 * The list is that set, on screen, a row at a time. A group is one row that
 * holds several, opened by its caret; what it wants back — one tool for all of
 * them, or the best for each — is a word on the row, because it changes the
 * answer underneath and a shop should not have to open a dialog to see which
 * question was asked.
 *
 * **And the answer is on the row too** (Paul, 2026-09-02: "we could get rid of
 * the bottom table and just show the tool for the group or selected features in
 * the feature list, under the folder or feature — then clicking on the tool
 * there would show the list of compatible tools"). The recommendations were a
 * table of their own under the part, which is a second place to read the same
 * list and a panel that had to have *something* in it when nothing was
 * selected — which is how the whole catalog kept coming back. Here the question
 * and its answer are one row, and the answer is the way through to the offer
 * behind it.
 */
export interface FeatureListPanelProps {
  readonly items: ReadonlyArray<ListItem>
  /** The row whose tools are on screen; null while nothing is selected. */
  readonly selectedId: string | null
  /** The feature inside a group whose tools are on screen, where it is one. */
  readonly selectedTag?: string | null
  readonly onSelect: (id: string | null, tag?: string | null, toolGuid?: string) => void
  /** The tool the panel beside the table is showing, so its line reads as chosen. */
  readonly chosenTool?: string | null
  /**
   * What each row is answered with: the one tool the rules put first.
   *
   * Looked up by item id — a row with no answer yet simply shows none, rather
   * than the panel having to know how a tool is chosen.
   */
  readonly answers?: ReadonlyArray<RecommendationRow>
  readonly unit: UnitSystem
  /** The groups standing open. */
  readonly open: ReadonlyArray<string>
  readonly onOpen: (id: string) => void
  /** What one feature is called, and the glyph it is drawn with. */
  readonly nameOf: (tag: string) => string
  readonly iconOf?: (tag: string) => ReactNode
  /** Which way up a feature is cut, for the corner of its row. */
  readonly directionOf?: (tag: string) => string | null
  readonly onAddFeature: () => void
  readonly onAddGroup: () => void
  /**
   * Whether *Add feature* is waiting for a face to be clicked.
   *
   * The button was disabled until something was read, which read as broken
   * rather than as waiting (Paul, 2026-09-02: "Add feature is greyed out by
   * default, which makes it confusing — it should be clickable, then just
   * prompt you to click on the part"). It is always pressable now, and this is
   * the state pressing it puts the panel in.
   */
  readonly addingFeature: boolean
  readonly onEdit: (id: string) => void
  readonly onRemove: (id: string) => void
}

/** What a group's result option is called where it has to fit in a row. */
const RESULT_LABEL = {
  all: 'one for all',
  each: 'one each',
} as const

/**
 * The two menus this panel needs, hand-drawn.
 *
 * The kit has `Menu`, and it is the right thing in a page; this panel is 320
 * pixels of a card that already draws its own dropdown for a face's readings,
 * and a second popover with different manners inside the same box reads as a
 * different application. One shape, opened two ways: pressed on the `+`, and
 * right-clicked on a row.
 */
const Popover = ({
  onClose,
  at,
  children,
}: {
  onClose: () => void
  /** Where the right-click was, in the window. */
  at: { readonly x: number; readonly y: number }
  children: ReactNode
}) => {
  const box = useRef<HTMLUListElement>(null)
  useEffect(() => {
    const away = (event: MouseEvent) => {
      if (!box.current?.contains(event.target as Node)) {
        onClose()
      }
    }
    // A frame late, or the click that opened it closes it again.
    const timer = window.setTimeout(() => document.addEventListener('mousedown', away), 0)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('mousedown', away)
    }
  }, [onClose])
  /*
    **Fixed to the window, not to the row** (Paul, 2026-09-02: "the feature list
    should overlap, not require me to scroll down to access the right click
    menu"). Positioned inside the list it was clipped by the list's own scroll,
    so the menu for a row near the bottom opened where nobody could reach it —
    the very thing the scroll was supposed to make safe.
  */
  return (
    <ul
      ref={box}
      style={{ left: at.x, top: at.y }}
      className="fixed z-50 w-max min-w-40 rounded-lg border border-zinc-800 bg-zinc-950 py-0.5 shadow-xl"
    >
      {children}
    </ul>
  )
}

const MenuItem = ({
  onClick,
  danger = false,
  children,
}: {
  onClick: () => void
  danger?: boolean
  children: ReactNode
}) => (
  <li>
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full px-2 py-1 text-left text-xs hover:bg-zinc-900',
        danger ? 'text-danger' : 'text-zinc-300',
      )}
    >
      {children}
    </button>
  </li>
)

/**
 * One tool a row is answered with, and the way to the whole offer behind it.
 *
 * **A row can carry several** (Paul, 2026-09-02: "a feature or group can have
 * multiple tools saved to it"): a hole is a spot drill and a drill, so each
 * gets a line and each is a way in — pressing one opens *that* tool in the
 * panel beside the table, which is where it is removed or re-held.
 */
const Answer = ({
  pick,
  unit,
  here,
  label,
  onOpen,
}: {
  pick: Pick
  unit: UnitSystem
  here: boolean
  /** What the row is, for the press to name what it opens. */
  label: string
  onOpen: () => void
}) => {
  const diameter = pick.tool.geometry.DC
  /*
    **What it is held in, under it** (Paul, 2026-09-02: "holders and collets
    should also be shown with the tool in the feature list"). A decision is a
    tool *and* what puts it in the spindle, and the cards that used to say so
    beside the part are gone.
  */
  const holding = [pick.holder, pick.collet].filter((each) => each !== null).join(' · ')
  return (
    <button
      type="button"
      aria-pressed={here}
      aria-label={`${pick.tool.catalogNumber} for ${label}`}
      title={`${pick.tool.catalogNumber}${holding === '' ? '' : ` in ${holding}`} — every tool that fits ${label}`}
      onClick={onOpen}
      className={cn(
        'text-2xs flex w-full flex-col gap-0.5 rounded border px-1.5 py-0.5 text-left transition',
        here
          ? 'border-info/60 bg-info/15 text-info'
          : 'border-transparent text-zinc-400 hover:border-zinc-800 hover:bg-zinc-900/60 hover:text-zinc-200',
      )}
    >
      <span className="flex w-full items-center gap-1.5">
        <span className="shrink-0">
          <ToolTypeIcon toolType={pick.tool.form} />
        </span>
        <span className="min-w-0 flex-1 truncate font-mono">{pick.tool.catalogNumber}</span>
        <span className="shrink-0 font-mono text-zinc-500">
          {diameter === undefined ? '' : formatGeometry('DC', diameter, unit)}
        </span>
      </span>
      {holding === '' ? null : (
        <span className="w-full truncate pl-5 font-mono text-zinc-500">{holding}</span>
      )}
    </button>
  )
}

/** Every tool a row is answered with, or what it says in place of them. */
const Answers = ({
  row,
  unit,
  chosenTool,
  here,
  onOpen,
}: {
  row: RecommendationRow | undefined
  unit: UnitSystem
  /** The tool the panel is showing, so the row can mark which of its lines it is. */
  chosenTool: string | null
  here: boolean
  onOpen: (toolGuid: string) => void
}) => {
  if (row === undefined) {
    return null
  }
  if (row.picks.length === 0) {
    if (row.note === 'Finding a compatible tool...') {
      return (
        <span role="status" className="text-2xs flex items-center gap-1 px-1 text-zinc-500">
          <span
            aria-hidden="true"
            className="size-2.5 animate-spin rounded-full border-2 border-zinc-700 border-t-info"
          />
          {row.note}
        </span>
      )
    }
    return <span className="text-2xs px-1 text-zinc-600">{row.note ?? '—'}</span>
  }
  return (
    <div className="flex flex-col gap-0.5">
      {row.picks.map((pick) => (
        <Answer
          key={pick.tool.guid}
          pick={pick}
          unit={unit}
          label={row.label}
          here={here && (chosenTool === null || chosenTool === pick.tool.guid)}
          onOpen={() => onOpen(pick.tool.guid)}
        />
      ))}
    </div>
  )
}

export const FeatureListPanel = ({
  items,
  selectedId,
  selectedTag = null,
  onSelect,
  chosenTool = null,
  answers = [],
  unit,
  open,
  onOpen,
  nameOf,
  iconOf,
  directionOf,
  onAddFeature,
  onAddGroup,
  addingFeature,
  onEdit,
  onRemove,
}: FeatureListPanelProps) => {
  /** The row a right-click is asking about, and where it was asked. */
  const [asking, setAsking] = useState<{
    readonly id: string
    readonly x: number
    readonly y: number
  } | null>(null)

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1">
      {items.length === 0 ? null : (
        /*
          **It fills the space it has, then scrolls** (Paul, 2026-09-02: "if it
          needs the space, the list goes down to the top of the table if it is
          shown, or 2/3 of the way down the screen if it is not, then is
          scrollable").

          Two earlier answers were worse. A fixed cap put a right-click menu
          under the fold on a list nobody knew was longer; stacking sideways
          into columns spilled out of the card, because a wrapping flex column's
          intrinsic width is measured without its height cap, so the box around
          it never grew. The height is the card's to decide — it is the one
          thing that knows whether the table is under it — and this only has to
          scroll inside whatever it is given.
        */
        <ul
          className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto"
          aria-label="Features being asked about"
        >
          {items.map((item) => {
            const answer = answers.find((row) => row.id === item.id)
            const here = item.id === selectedId && selectedTag === null
            const opened = open.includes(item.id)
            const label = labelOf(item, nameOf)
            return (
              <li key={item.id} className="relative">
                <div
                  className={cn(
                    'flex items-center gap-1 rounded border px-1.5 py-1 text-left transition',
                    here
                      ? 'border-info/60 bg-info/15'
                      : 'border-transparent hover:border-zinc-800 hover:bg-zinc-900/60',
                  )}
                >
                  {/* A group opens; a feature has nothing to open, and keeps
                      the indent so the two kinds line up. */}
                  {item.kind === 'group' ? (
                    <button
                      type="button"
                      aria-expanded={opened}
                      aria-label={`${opened ? 'Close' : 'Open'} ${label}`}
                      onClick={() => onOpen(item.id)}
                      className="shrink-0 rounded p-0.5 text-zinc-500 hover:text-zinc-200"
                    >
                      {opened ? <CaretDownIcon /> : <CaretRightIcon />}
                    </button>
                  ) : (
                    <span aria-hidden="true" className="size-4 shrink-0" />
                  )}
                  <button
                    type="button"
                    aria-pressed={here}
                    // Named for what it is, so the caret beside it — "Open 4 ×
                    // Through Hole" — is a different control by its name as
                    // well as by its shape.
                    aria-label={label}
                    // Selecting the row already on screen puts it down again,
                    // which is the way back to the list's own answers.
                    onClick={() => onSelect(here ? null : item.id)}
                    onContextMenu={(event) => {
                      event.preventDefault()
                      setAsking({ id: item.id, x: event.clientX, y: event.clientY })
                    }}
                    className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                  >
                    <span className="shrink-0 text-zinc-400">
                      {item.kind === 'group' ? (
                        opened ? (
                          <FolderOpenIcon />
                        ) : (
                          <FolderIcon />
                        )
                      ) : (
                        (iconOf?.(item.tags[0] ?? '') ?? null)
                      )}
                    </span>
                    <span
                      className={cn(
                        'min-w-0 flex-1 truncate text-xs',
                        here ? 'text-zinc-100' : 'text-zinc-300',
                      )}
                    >
                      {label}
                    </span>
                    {/* What the group was asked for, on the row: it changes the
                        answer underneath, and a shop should not have to open a
                        dialog to see which question it is. */}
                    {item.kind === 'group' ? (
                      <span
                        className="text-2xs shrink-0 rounded bg-zinc-800 px-1 py-0.5 text-zinc-400"
                        title={
                          item.results === 'all'
                            ? 'One tool that cuts every feature in this group'
                            : 'The best tool for each feature in this group'
                        }
                      >
                        {RESULT_LABEL[item.results]}
                      </span>
                    ) : (
                      <span className="text-2xs shrink-0 font-mono text-zinc-500">
                        {directionOf?.(item.tags[0] ?? '') ?? ''}
                      </span>
                    )}
                    {item.tags.length > 1 ? (
                      <span
                        className="text-2xs shrink-0 rounded bg-zinc-800 px-1 py-0.5 font-semibold text-zinc-300"
                        title={`${String(item.tags.length)} features`}
                      >
                        ×{item.tags.length}
                      </span>
                    ) : null}
                  </button>
                </div>

                {asking?.id === item.id ? (
                  <Popover onClose={() => setAsking(null)} at={asking}>
                    <MenuItem
                      onClick={() => {
                        setAsking(null)
                        onEdit(item.id)
                      }}
                    >
                      Edit {item.kind === 'group' ? 'group' : 'feature'}…
                    </MenuItem>
                    <MenuItem
                      danger
                      onClick={() => {
                        setAsking(null)
                        onRemove(item.id)
                      }}
                    >
                      Remove
                    </MenuItem>
                  </Popover>
                ) : null}

                {/*
                  **The answer under the question.** A group asked for one tool
                  *each* has no single answer, so what sits under it is its
                  features, each with its own — and each of those is a way
                  through to the tools that fit that one feature.
                */}
                {answer !== undefined && (answer.children.length === 0 || !opened) ? (
                  <div className="mt-0.5 ml-6">
                    <Answers
                      row={answer}
                      unit={unit}
                      chosenTool={chosenTool}
                      here={here}
                      onOpen={(toolGuid) => onSelect(item.id, null, toolGuid)}
                    />
                  </div>
                ) : null}

                {/* What is in the group, where it is open. A feature inside a
                    group is not a row of the list — it cannot be edited or
                    removed on its own — so it reads as contents rather than as
                    more rows, and only its answer is pressable. */}
                {item.kind === 'group' && opened ? (
                  <ul className="mt-0.5 ml-6 flex flex-col gap-1 border-l border-zinc-800 pl-2">
                    {(answer?.children.length ?? 0) > 0
                      ? answer?.children.map((child) => (
                          <li key={child.id} className="flex flex-col gap-0.5">
                            <span className="text-2xs flex items-center gap-1.5 text-zinc-400">
                              <span className="shrink-0 text-zinc-600">
                                {child.tag === null ? null : (iconOf?.(child.tag) ?? null)}
                              </span>
                              <span className="min-w-0 flex-1 truncate">{child.label}</span>
                              <span className="shrink-0 font-mono text-zinc-600">
                                {child.tag === null ? '' : (directionOf?.(child.tag) ?? '')}
                              </span>
                            </span>
                            <Answers
                              row={child}
                              unit={unit}
                              chosenTool={chosenTool}
                              here={item.id === selectedId && selectedTag === child.tag}
                              onOpen={(toolGuid) => onSelect(item.id, child.tag, toolGuid)}
                            />
                          </li>
                        ))
                      : item.tags.map((tag) => (
                          <li
                            key={tag}
                            className="text-2xs flex items-center gap-1.5 py-0.5 text-zinc-400"
                          >
                            <span className="shrink-0 text-zinc-600">{iconOf?.(tag) ?? null}</span>
                            <span className="min-w-0 flex-1 truncate">{nameOf(tag)}</span>
                            <span className="shrink-0 font-mono text-zinc-600">
                              {directionOf?.(tag) ?? ''}
                            </span>
                          </li>
                        ))}
                  </ul>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}

      {/*
        **Two buttons, not one that asks** (Paul, 2026-09-02: "it should show
        buttons for Add Feature or Add Group, not the weird combined one"). A
        `+` that opened a menu of two put a popover between somebody and the
        two things they could do, and hid both of them until it was pressed.
        There are two things; there are two buttons.
      */}
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-pressed={addingFeature}
          title="Add the feature being read"
          onClick={onAddFeature}
          className={cn(
            'focus-visible:ring-info/60 flex flex-1 items-center justify-center gap-1 rounded border border-dashed px-2 py-1 text-xs transition focus-visible:ring-1 focus-visible:outline-none',
            addingFeature
              ? 'border-info/60 bg-info/15 text-info'
              : 'border-zinc-800 text-zinc-500 hover:border-zinc-700 hover:text-zinc-200',
          )}
        >
          <PlusIcon aria-hidden="true" />
          Add feature
        </button>
        <button
          type="button"
          onClick={onAddGroup}
          className="focus-visible:ring-info/60 flex flex-1 items-center justify-center gap-1 rounded border border-dashed border-zinc-800 px-2 py-1 text-xs text-zinc-500 transition hover:border-zinc-700 hover:text-zinc-200 focus-visible:ring-1 focus-visible:outline-none"
        >
          <PlusIcon aria-hidden="true" />
          Add group
        </button>
      </div>
      {/* Pressed with nothing being read, the button asks for the one thing it
          needs rather than refusing to be pressed. */}
      {addingFeature ? (
        <p className="text-2xs text-info">Click a face on the part, then press Add feature.</p>
      ) : null}
    </div>
  )
}
