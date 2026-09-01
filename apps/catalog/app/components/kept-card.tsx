import { ListBulletsIcon, PencilSimpleIcon, XIcon } from '@phosphor-icons/react'
import { Card } from '@toolpath/ui'
import type { CatalogTool } from '@toolpath/catalog-data'
import { classNames } from '@toolpath/domain/class-names'
import { ToolTypeIcon } from './tool-icons'

/**
 * What has been kept for one feature, over the part.
 *
 * Paul's layout (2026-08-31): the order list is a page, but what is
 * decided so far belongs beside the thing it was decided about. **One card per
 * feature** — the bill groups by assembly because that is what gets bought,
 * and the part groups by feature because that is what is being looked at. A
 * threaded hole is one card, "Threaded Blind Hole", carrying both the drill
 * and the tap.
 *
 * Pressing it reads that feature again, so the way back to a decision is the
 * decision itself.
 */
export interface KeptCardProps {
  /** The feature it was kept for, in the words the panel uses. */
  readonly feature: string
  /** Everything kept for it, in the order it was kept. */
  readonly tools: ReadonlyArray<CatalogTool>
  /**
   * The holder and collet, where one tool was kept and they were chosen.
   * Null where nothing was chosen, or where the tools do not agree.
   */
  readonly holding: string | null
  readonly reading: boolean
  readonly onRead: () => void
  /**
   * Taking everything on the card off the bill.
   *
   * On the card because the card is where somebody sees the decision; a
   * decision that can be seen and not undone in the same place sends them to
   * another page to undo it (Paul, 2026-08-31).
   */
  readonly onRemove: () => void
  /**
   * The way to the order list, from the part.
   *
   * The tab is the other way in, but the card is where somebody is looking
   * when they want the list — it is the part's own record of what is on it
   * (Paul, 2026-08-31: "I should have the option to open the order list
   * through the part buttons").
   */
  readonly onOpenList?: () => void
  /**
   * Changing the holder and collet of one of them, from the card.
   *
   * The card is where a decision is seen, so it is where it is edited — the
   * same pencil the list carries, on the tool it is about (Paul, 2026-08-31).
   */
  readonly onEdit?: (tool: CatalogTool, at: DOMRect) => void
}

export const KeptCard = ({
  feature,
  tools,
  holding,
  reading,
  onRead,
  onRemove,
  onEdit,
  onOpenList,
}: KeptCardProps) => (
  <Card
    className={classNames(
      'group relative w-56 shrink-0 overflow-hidden bg-zinc-950/85 backdrop-blur transition',
      reading && 'ring-info/60 ring-1',
    )}
  >
    {/* Outside the card's own button rather than inside it: one button cannot
        hold another, and reading a feature is not removing it. */}
    {onOpenList ? (
      <button
        type="button"
        aria-label="Open the order list"
        title="Open the order list"
        onClick={onOpenList}
        className="focus-visible:ring-info/60 hover:text-info absolute top-1 right-6 z-10 rounded p-0.5 text-zinc-600 opacity-60 transition group-hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-1 focus-visible:outline-none"
      >
        <ListBulletsIcon aria-hidden="true" />
      </button>
    ) : null}
    <button
      type="button"
      aria-label={`Remove what is kept for ${feature} from the order list`}
      title="Remove from the order list"
      onClick={onRemove}
      className="focus-visible:ring-danger/60 hover:text-danger absolute top-1 right-1 z-10 rounded p-0.5 text-zinc-600 opacity-60 transition group-hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-1 focus-visible:outline-none"
    >
      <XIcon aria-hidden="true" />
    </button>
    <button
      type="button"
      onClick={onRead}
      className="focus-visible:ring-info/60 block w-full truncate py-1.5 pr-6 pl-2 text-left focus-visible:ring-1 focus-visible:outline-none"
    >
      <span className="text-2xs block truncate font-semibold tracking-wide text-zinc-500 uppercase">
        {feature}
      </span>
    </button>
    {/*
      Every tool kept for it: a threaded hole carries its drill and its tap,
      and reading one without the other is half the operation. Each carries its
      own pencil, because the holder is a decision about *that* tool (Paul,
      2026-08-31) — and each is its own row rather than a line inside the
      card's button, since one button cannot hold another.
    */}
    <ul className="flex flex-col gap-0.5 px-2 pb-1.5">
      {tools.map((tool) => (
        <li key={tool.guid} className="flex items-center gap-1.5">
          <span className="shrink-0 text-zinc-400">
            <ToolTypeIcon toolType={tool.form} />
          </span>
          <span className="min-w-0 flex-1 truncate font-mono text-xs text-zinc-100">
            {tool.catalogNumber}
          </span>
          {onEdit ? (
            <button
              type="button"
              aria-label={`Edit the holder and collet for ${tool.catalogNumber}`}
              title="Edit the holder and collet"
              onClick={(event) => onEdit(tool, event.currentTarget.getBoundingClientRect())}
              className="focus-visible:ring-info/60 hover:text-info shrink-0 rounded p-0.5 text-zinc-600 opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-1 focus-visible:outline-none"
            >
              <PencilSimpleIcon aria-hidden="true" />
            </button>
          ) : null}
        </li>
      ))}
      {holding === null ? (
        tools.length > 1 ? null : (
          <li className="text-2xs text-zinc-600">no holder yet</li>
        )
      ) : (
        <li className="text-2xs truncate text-zinc-500">{holding}</li>
      )}
    </ul>
  </Card>
)
