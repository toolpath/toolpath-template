import { Button, IconButton, Menu, cn } from '@toolpath/ui'
import type { ReactNode } from 'react'
import { CaretDownIcon, CaretRightIcon, FolderIcon, FolderOpenIcon } from '@phosphor-icons/react'
import { formatGeometry } from 'shared/geometry'
import type { UnitSystem } from '@toolpath/tool-support'
import { defaultLabelOf, labelOf, type ListItem } from 'shared/feature-list'
import { typeLabel } from 'shared/tool-type'
import type { Pick, RecommendationRow } from 'shared/recommendations'
import { NameField } from './name-field'
import { HolderIcon, ToolTypeIcon } from './tool-icons'

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
  /**
   * **The three presses that grow the list are not in it** (Paul, 2026-09-08:
   * "move the add feature, add group, and add tool assembly buttons so they are
   * always at the top left of the part viewer"). They sat under the rows, which
   * put them below the fold on any list long enough to scroll — the one state
   * where somebody most wants to add another. `components/add-bar.tsx` is where
   * they live now; this panel is the list and nothing else.
   */
  readonly onEdit: (id: string) => void
  readonly onRemove: (id: string) => void
  /**
   * The part-level assembly being named, where one is.
   *
   * **Naming is opened from outside as well as from here** (Paul, 2026-09-08:
   * a tool assembly is named when it is created, and from the right-click menu
   * afterwards). The row a press has just made is named without a second
   * gesture, and the route is what knows a row has just been made — so which
   * row is open for naming is the route's, and this draws it.
   */
  readonly renamingId?: string | null
  /** Right-click → *Rename*: an assembly already on the list. */
  readonly onRenameStart?: (id: string) => void
  /** Kept. Empty is no name at all — `feature-list.ts` `renameItem` is the rule. */
  readonly onRename?: (id: string, name: string) => void
  /** Escape or a press elsewhere: leave the row called what it was called. */
  readonly onRenameCancel?: () => void
  /**
   * What the shop called the stack behind one of a row's lines, or null where
   * they called it nothing (Paul, 2026-09-08: "it still isn't showing the name
   * in the order list in the parts page").
   *
   * A line on this list is a stack the tree holds, and the name lives on the
   * stack — so the route reads it off the tree for the row and the tool, and
   * this draws it. Null keeps every unnamed line exactly as it was.
   */
  readonly assemblyOf?: (itemId: string, toolGuid: string) => string | null
}

/**
 * What makes a kit `Button` narrower than the words in it.
 *
 * **The list must never scroll sideways** (Paul, 2026-09-08: "I should never
 * have to horizontally scroll in the feature list — long names should …").
 * `@toolpath/ui` wraps a button's children in a `whitespace-nowrap` box of its
 * own, and that box takes its width from its contents: a `truncate` on a span
 * inside one never fires, because the box grows to fit the span instead. The
 * row grew with it, the column is a fixed 320px, and what was left was a
 * horizontal scrollbar under a list whose ends nobody could read.
 *
 * These make that box a line that may be narrower than what is in it, which is
 * all an ellipsis needs. `FITS` also lays the children out, because a block box
 * puts them inline and `truncate` does nothing to an inline span; `STACKS`
 * leaves the block flow alone for a button whose children are already lines.
 */
const FITS = '[&>div]:flex [&>div]:w-full [&>div]:min-w-0 [&>div]:items-center [&>div]:gap-1.5'

const STACKS = '[&>div]:w-full [&>div]:min-w-0'

/** What a group's result option is called where it has to fit in a row. */
const RESULT_LABEL = {
  all: 'one for all',
  each: 'one each',
} as const

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
  assembly,
  onOpen,
}: {
  pick: Pick
  unit: UnitSystem
  here: boolean
  /** What the row is, for the press to name what it opens. */
  label: string
  /**
   * What the shop called the stack this line stands for, where they called it
   * anything (Paul, 2026-09-08: "it still isn't showing the name in the order
   * list in the parts page").
   *
   * Null on every stack nobody named, which is most of them: a number over a
   * catalog number would be noise on every line.
   */
  assembly: string | null
  onOpen: () => void
}) => {
  const diameter = pick.tool.geometry.DC
  /*
    **A catalog number is not a tool** (Paul, 2026-09-09: "I'd like to add the
    tool type and vendor into the order list — it should say 'Emuge 2810.0250 -
    Flat End Mill'"). `2810.0250` is what a shop orders by and nothing else: it
    says neither who makes it nor what it cuts, so a list of them is a list
    nobody can read without opening every row.

    The words are the Vendor column's and the Type column's — `brand` is what
    that column is called, and `typeLabel` is the one place a form becomes a
    phrase (`shared/tool-type.ts`), so a line here says exactly what the table
    beside it says about the same tool.
  */
  const type = typeLabel(pick.tool)
  /*
    **What it is held in, under it** (Paul, 2026-09-02: "holders and collets
    should also be shown with the tool in the feature list"). A decision is a
    tool *and* what puts it in the spindle, and the cards that used to say so
    beside the part are gone.
  */
  const holding = [pick.holder, pick.collet].filter((each) => each !== null).join(' · ')
  return (
    <Button
      type="button"
      variant="muted"
      size="sm"
      // The `<button>` itself, rather than the box inside it — see the row's own.
      full
      aria-pressed={here}
      aria-label={`${assembly === null ? '' : `${assembly}: `}${pick.tool.brand} ${pick.tool.catalogNumber}, ${type}, for ${label}`}
      title={`${assembly === null ? '' : `${assembly} — `}${pick.tool.brand} ${pick.tool.catalogNumber} - ${type}${holding === '' ? '' : ` in ${holding}`} — every tool that fits ${label}`}
      onClick={onOpen}
      className={cn(
        STACKS,
        'text-2xs flex w-full min-w-0 flex-col gap-0.5 rounded border px-1.5 py-0.5 text-left transition',
        here
          ? 'border-info/60 bg-info/15 text-info'
          : 'border-transparent text-zinc-400 hover:border-zinc-800 hover:bg-zinc-900/60 hover:text-zinc-200',
      )}
    >
      {/*
        **The name over the stack it names**, the way the tree's card carries
        it: it is the most human-readable thing on the line, and a shop that
        troubled to call a stack something is a shop that will look for it here.
      */}
      {assembly === null ? null : (
        <span className="w-full truncate font-medium text-zinc-300">{assembly}</span>
      )}
      <span className="flex w-full min-w-0 items-center gap-1.5">
        <span className="shrink-0">
          <ToolTypeIcon toolType={pick.tool.form} />
        </span>
        {/*
          **What it is truncates before what it is called.** The vendor and the
          catalog number are what a shop orders by, so they keep their width and
          the phrase behind them takes the ellipsis — a row narrow enough to cut
          something still reads `Emuge 2810.0250 - Flat end…` rather than
          `Emuge 2810.02…`.
        */}
        <span className="shrink-0">{pick.tool.brand}</span>
        <span className="min-w-0 shrink truncate font-mono">{pick.tool.catalogNumber}</span>
        <span className="min-w-0 flex-1 truncate text-zinc-500">- {type}</span>
        <span className="shrink-0 font-mono text-zinc-500">
          {diameter === undefined ? '' : formatGeometry('DC', diameter, unit)}
        </span>
      </span>
      {holding === '' ? null : (
        <span className="w-full truncate pl-5 font-mono text-zinc-500">{holding}</span>
      )}
    </Button>
  )
}

/** Every tool a row is answered with, or what it says in place of them. */
const Answers = ({
  row,
  unit,
  chosenTool,
  here,
  assemblyOf,
  onOpen,
}: {
  row: RecommendationRow | undefined
  unit: UnitSystem
  /** The tool the panel is showing, so the row can mark which of its lines it is. */
  chosenTool: string | null
  here: boolean
  /** What the shop called the stack behind one of this row's lines, or null. */
  assemblyOf: (toolGuid: string) => string | null
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
          assembly={assemblyOf(pick.tool.guid)}
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
  onEdit,
  onRemove,
  renamingId = null,
  onRenameStart,
  onRename,
  onRenameCancel,
  assemblyOf,
}: FeatureListPanelProps) => {
  /** The row a right-click is asking about, and where it was asked. */
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
          /*
            **The rows take the pointer; the column they stand in does not**
            (Paul, 2026-09-08: "make the list rows sit on top of the 3d viewer
            rather than in the box"). With the card gone this is the only thing
            over the canvas that is meant to be clicked, and an invisible box
            carrying `pointer-events: auto` is a curtain — the defect
            `tests/on-the-part.spec.ts` § "at a laptop width" exists for.
          */
          className="pointer-events-auto flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto"
          aria-label="Features being asked about"
        >
          {items.map((item) => {
            const answer = answers.find((row) => row.id === item.id)
            const here = item.id === selectedId && selectedTag === null
            const opened = open.includes(item.id)
            const label = labelOf(item, nameOf)
            /* Only an assembly is named: a feature and a group are called what
               the part calls them — `feature-list.ts` `renameItem`. */
            const naming = item.kind === 'assembly' && item.id === renamingId
            return (
              /*
                **Each row is its own plate.** Standing on the part rather than
                in a panel, a row has whatever the part is painted in behind it
                — so it carries just enough ground of its own to be read, which
                is a row on the viewer rather than a box around the list.
              */
              <li key={item.id} className="relative rounded bg-zinc-950/75">
                <Menu context>
                  {/*
                    **Block, not the kit's `inline-block`.** A shrink-to-fit box
                    takes the width of its contents wherever they cannot be made
                    narrower, which is how one long name pushed the whole list
                    past its column and put a scrollbar under it.
                  */}
                  <Menu.Trigger className="block w-full min-w-0">
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
                        <IconButton
                          type="button"
                          size="sm"
                          variant="muted"
                          aria-expanded={opened}
                          aria-label={`${opened ? 'Close' : 'Open'} ${label}`}
                          onClick={() => onOpen(item.id)}
                          /*
                            **The caret is the gutter, not a control beside it**
                            (Paul, 2026-09-08: "the arrow is so big, then the
                            text is so short … the arrow should be to the left
                            of other rows"). It is exactly the width of the
                            spacer every other row keeps in its place, so a
                            group's name starts where a feature's name starts
                            and the caret hangs to the left of both.
                          */
                          className="!size-4 shrink-0 rounded border-0 bg-transparent p-0 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200 [&_svg]:!size-3"
                        >
                          {opened ? <CaretDownIcon /> : <CaretRightIcon />}
                        </IconButton>
                      ) : (
                        <span aria-hidden="true" className="size-4 shrink-0" />
                      )}
                      {naming ? (
                        <NameField
                          value={item.name ?? ''}
                          /* What it goes on being called if nothing is typed,
                             rather than a prompt — `name-field.tsx` says why. */
                          placeholder={defaultLabelOf(item, nameOf)}
                          /* What it is called *now*, so the tick beside a named
                             row says which row it is about. */
                          label={label}
                          onCommit={(name) => onRename?.(item.id, name)}
                          onCancel={() => onRenameCancel?.()}
                        />
                      ) : (
                        /*
                          **A box the button can fill, rather than a button the
                          row stretches.** A kit `Button` puts the className it
                          is given on the box inside it, so the `<button>` keeps
                          `min-width: auto` — the whole unbroken name — and a
                          row that made every button in it `flex-1` stretched
                          the caret to half the row along with it. This is the
                          one flex item, and the button fills it.
                        */
                        <div className="min-w-0 flex-1">
                          <Button
                            type="button"
                            variant="muted"
                            size="sm"
                            /*
                              **`full` is the only way to widen the `<button>`
                              itself.** A `<button>` sizes to fit its contents
                              even as a flex container, and the className a kit
                              `Button` is given lands on the box inside it — so
                              without this the button takes the width of the
                              whole unbroken name and hangs out of the row.
                            */
                            full
                            aria-pressed={here}
                            // Named for what it is, so the caret beside it — "Open 4 ×
                            // Through Hole" — is a different control by its name as
                            // well as by its shape.
                            aria-label={label}
                            // Selecting the row already on screen puts it down again,
                            // which is the way back to the list's own answers.
                            onClick={() => onSelect(here ? null : item.id)}
                            /*
                          `w-full` is load-bearing: the className reaches the
                          box *inside* the button, and that box is sized by what
                          is in it unless it is told to be the width of the
                          button — which is what leaves the ellipsis somewhere
                          to happen.
                        */
                            className={cn(
                              FITS,
                              'flex w-full min-w-0 flex-1 items-center gap-1.5 text-left',
                            )}
                          >
                            <span className="shrink-0 text-zinc-400">
                              {item.kind === 'group' ? (
                                opened ? (
                                  <FolderOpenIcon />
                                ) : (
                                  <FolderIcon />
                                )
                              ) : item.kind === 'assembly' ? (
                                /* No feature to draw, so it wears what it is: a
                               stack in a holder. */
                                <HolderIcon />
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
                            ) : item.kind === 'assembly' ? (
                              /* **It says what it is on the row** (Paul,
                             2026-09-08). A stack that answers no feature looks
                             exactly like one that answers a feature nobody can
                             see any more, and the two are different things. */
                              <span
                                className="text-2xs shrink-0 rounded bg-zinc-800 px-1 py-0.5 text-zinc-400"
                                title="A tool assembly for the part, not for a feature"
                              >
                                no feature
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
                          </Button>
                        </div>
                      )}
                    </div>
                  </Menu.Trigger>
                  <Menu.Popover>
                    {/* An assembly has no features to pick, so there is nothing
                        an editor could ask about: it is built in its own tree
                        and removed here. */}
                    {item.kind === 'assembly' ? (
                      /* **The one row kind with a name to give** (Paul,
                         2026-09-08). It answers no feature, so "Tool assembly
                         3" is the whole of what the list can say about it
                         until somebody says what it is for. */
                      <Menu.Item onClick={() => onRenameStart?.(item.id)}>Rename…</Menu.Item>
                    ) : (
                      <Menu.Item onClick={() => onEdit(item.id)}>
                        Edit {item.kind === 'group' ? 'group' : 'feature'}…
                      </Menu.Item>
                    )}
                    <Menu.Item variant="danger" onClick={() => onRemove(item.id)}>
                      Remove
                    </Menu.Item>
                  </Menu.Popover>
                </Menu>

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
                      assemblyOf={(toolGuid) => assemblyOf?.(item.id, toolGuid) ?? null}
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
                              assemblyOf={(toolGuid) => assemblyOf?.(item.id, toolGuid) ?? null}
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
    </div>
  )
}
