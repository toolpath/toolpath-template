import { Button, cn } from '@toolpath/ui'

/**
 * The three presses that grow the feature list, over the top-left of the part.
 *
 * **They belong to the part, not to the list** (Paul, 2026-09-08: "move the add
 * feature, add group, and add tool assembly buttons so they are always at the
 * top left of the part viewer"). They sat under the rows inside the Features
 * card, which is the one place they cannot be relied on: the list fills the
 * space it has and then scrolls, so on a part with a dozen rows the three ways
 * to add a thirteenth were below the fold. Over the viewer they are in the same
 * place whatever the list is doing.
 *
 * **And they are named for what they make** (Paul, 2026-09-08: "change them to
 * + Feature, + Group, + Tool Assembly"). The `+` is the verb, so the word after
 * it is the whole of what the press is about.
 *
 * It draws and reports. What each press *means* is the route's: a feature is
 * the reading being kept, a group opens the editor, an assembly is a row of its
 * own that answers no feature at all.
 */
export interface AddBarProps {
  readonly onAddFeature: () => void
  readonly onAddGroup: () => void
  /**
   * A tool assembly the part needs and no feature asked for — `feature-list.ts`
   * § `AssemblyItem` is what it makes.
   */
  readonly onAddAssembly: () => void
  /**
   * Whether *+ Feature* is waiting for a face to be clicked.
   *
   * The button was disabled until something was read, which read as broken
   * rather than as waiting (Paul, 2026-09-02: "Add feature is greyed out by
   * default, which makes it confusing — it should be clickable, then just
   * prompt you to click on the part"). It is always pressable, and this is the
   * state pressing it puts the page in.
   */
  readonly addingFeature: boolean
}

const CHIP =
  'focus-visible:ring-info/60 flex items-center justify-center gap-1 rounded border border-dashed px-2 py-1 text-xs whitespace-nowrap transition focus-visible:ring-1 focus-visible:outline-none'

const QUIET = 'border-zinc-800 text-zinc-500 hover:border-zinc-700 hover:text-zinc-200'

/** Solid ground: a control over the 3D viewer that lets the part through is unreadable. */
const GROUND = 'filter-off'

export const AddBar = ({ onAddFeature, onAddGroup, onAddAssembly, addingFeature }: AddBarProps) => (
  /*
    **Only the buttons take the pointer.** A transparent box over the canvas
    carrying `pointer-events: auto` is a curtain: on 2026-09-02 one of them
    stopped click-drag-rotate on the whole part, and `tests/on-the-part.spec.ts`
    § "at a laptop width" is what pins it. This row is as wide as its buttons.
  */
  <div className="pointer-events-auto flex w-fit items-start gap-1">
    <Button
      type="button"
      variant="muted"
      size="sm"
      aria-pressed={addingFeature}
      title="Add the feature being read"
      onClick={onAddFeature}
      /* `filter-on` / `filter-off` rather than a tint: the part shows through a
         translucent ground, and these are the same colours mixed into the
         page's own — `styles.css` § filter-on says why. */
      className={cn(CHIP, addingFeature ? 'filter-on border-info/60 text-info' : cn(QUIET, GROUND))}
    >
      + Feature
    </Button>
    <Button
      type="button"
      variant="muted"
      size="sm"
      title="Pick several features on the part and ask for one tool that cuts all of them"
      onClick={onAddGroup}
      className={cn(CHIP, QUIET, GROUND)}
    >
      + Group
    </Button>
    <Button
      type="button"
      variant="muted"
      size="sm"
      title="A tool assembly for the part, tied to no feature"
      onClick={onAddAssembly}
      className={cn(CHIP, QUIET, GROUND)}
    >
      + Tool Assembly
    </Button>
  </div>
)
