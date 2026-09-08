import { XIcon } from '@phosphor-icons/react'
import { Button } from '@toolpath/ui'
import type { UnitSystem } from '@toolpath/tool-support'
import type { Results } from 'shared/feature-list'
import { readingText } from 'shared/feature-defaults'
import type { GroupReading } from 'shared/group-geometry'
import { useEscape } from 'shared/use-escape'
import { MeasurementIcon } from './feature-icons'

/**
 * Building a group: which features are in it.
 *
 * **The features are picked on the part**, with the mechanism that already
 * exists — a click is a click, and a group is what several of them add up to
 * (Paul, 2026-09-02).
 *
 * **A group asks one question, so it no longer offers one** (Paul, 2026-09-08).
 * Every group is *one tool for all of them* — a tool that cuts every feature in
 * it — which is the answer worth knowing before a job is quoted, so the box
 * says that in its note rather than spending a control on the only choice
 * there is. *The best tool for each* is parked (Paul, 2026-09-07) and the model
 * behind it is untouched: `Results` still has `each`, a group already saved as
 * one still answers and still opens, and this editor still reads `results` for
 * the words on its confirm.
 *
 * **The quick buttons came off with it** (Paul, 2026-09-08). Every feature of a
 * kind in one press was `typeButtons` in `shared/feature-list.ts`, which stands
 * unused for the same reason `each` does — putting the section back is what
 * restores it.
 *
 * **And it says what the group measures** (Paul, 2026-09-08). One tool for all
 * of them is a question about the hardest of them, so the box shows the worst
 * case of every field its features are shown by, and names the feature each one
 * came from. The strip is the feature box's own — same fields, same sheet, same
 * wording — because a group is the same question asked of more than one thing;
 * `shared/group-geometry.ts` is the fold, and this only draws it.
 */
export interface GroupEditorProps {
  /** What is in the group as it stands, clicked on the part. */
  readonly tags: ReadonlyArray<string>
  /**
   * What the group is being asked for. Every group made here is `all`; a group
   * saved as `each` before that option was parked still reads back as one, and
   * this is what the confirm's words are chosen from.
   */
  readonly results: Results
  readonly onDrop: (tag: string) => void
  readonly nameOf: (tag: string) => string
  readonly onConfirm: () => void
  readonly onCancel: () => void
  /** Whether this is an edit of a group that already exists, for the words on the button. */
  readonly editing?: boolean
  /**
   * Whether a tool has been picked from the list below.
   *
   * **Picking one is what finishes the group** (Paul, 2026-09-02: "I must
   * select a tool from the list when creating a feature, and that is what adds
   * it to the BOM"). The list under the part is already showing what fits the
   * group as it stands, so the last step is choosing from it rather than
   * confirming and choosing again somewhere else.
   */
  readonly picked?: boolean
  /** Per-feature recommendations must finish before an each group can be saved. */
  readonly matching?: 'idle' | 'pending' | 'error' | 'nothing-fits' | 'ready'
  /**
   * What the group measures: one row per field, folded to its worst case.
   *
   * Empty while the group is, and empty of a field none of its features
   * report — a row shown blank reads as a measurement that failed.
   */
  readonly readings?: ReadonlyArray<GroupReading>
  /** The unit the numbers are read in. */
  readonly unit: UnitSystem
}

/**
 * Where a group's number came from, feature by feature.
 *
 * Deduplicated: identical holes are one decision and thirty-nine of them are
 * one row on the list, so a tooltip repeating `Through Hole 8.00 mm` thirty-nine
 * times says nothing the first line did not.
 */
const traced = (
  reading: GroupReading,
  nameOf: (tag: string) => string,
  unit: UnitSystem,
): string => {
  const said = new Set<string>()
  for (const each of reading.per) {
    said.add(
      `${nameOf(each.featureTag)} ${readingText({ unit: reading.unit, value: each.value }, unit)}`,
    )
  }
  return [...said].join(' · ')
}

export const GroupEditor = ({
  tags,
  results,
  onDrop,
  nameOf,
  onConfirm,
  onCancel,
  editing = false,
  picked = false,
  matching = 'ready',
  readings = [],
  unit,
}: GroupEditorProps) => {
  /*
    Escape puts the draft down, the same as Cancel.

    The box is only ever on screen over the part, so it is the newest thing
    there and it owns the press — `useEscape` is a stack and the page
    registered at the bottom of it before this mounted, so one press backs out
    of the group rather than also dropping the reading behind it. Without a
    layer of its own the press fell straight through to the page and the draft
    stayed open, which is the only way out being the mouse.
  */
  useEscape(true, onCancel)

  return (
    <div className="flex flex-col gap-2">
      <span className="text-2xs font-semibold tracking-wide text-zinc-500 uppercase">
        {editing ? 'Edit group' : 'New group'}
      </span>

      {/*
      **The note is what the box used to say with a control** (Paul,
      2026-09-08). One tool for all of them is the only question a group asks,
      so the sentence that used to sit under a radio says it instead.
    */}
      <p className="text-2xs text-zinc-500">
        Select a feature on the part to add it to the group. The Tool Catalog will find tools
        compatible with all features in the group.
      </p>

      {/* What is in it, each with the way out. Empty says so rather than
        leaving a gap somebody has to interpret. */}
      {tags.length === 0 ? (
        <p className="text-2xs rounded border border-dashed border-zinc-800 px-2 py-1.5 text-zinc-600">
          Nothing in this group yet.
        </p>
      ) : (
        /*
        **Capped, and it scrolls** (Paul, 2026-09-02: "long lists of holes are
        still making the create group option go off the screen"). Thirty holes
        is thirty chips, which is a form taller than the window whatever the
        box is allowed to spill over. The chips are the part of it that grows
        without bound, so the cap goes there and the note above and the confirm
        below stay where they were put.

        The one scrollbar this panel has, and it is inside a control rather
        than around the box: what has to stay readable at a glance is what the
        group *is*, and the first rows of it say that.
      */
        <ul className="flex max-h-28 flex-wrap gap-1 overflow-y-auto pr-1">
          {tags.map((tag) => (
            <li key={tag}>
              <Button
                type="button"
                variant="muted"
                size="sm"
                aria-label={`Take ${nameOf(tag)} out of the group`}
                onClick={() => onDrop(tag)}
                className="text-2xs focus-visible:ring-info/60 flex items-center gap-1 rounded border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 text-zinc-300 hover:border-zinc-700 hover:text-zinc-100 focus-visible:ring-1 focus-visible:outline-none"
              >
                <span className="max-w-32 truncate">{nameOf(tag)}</span>
                <XIcon aria-hidden="true" className="shrink-0 text-zinc-500" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {/*
        **The hardest of them** (Paul, 2026-09-08). A group is one tool for all of
        them, so the number a tool is chosen against is the worst of the group's
        — the deepest reach, the tightest corner — rather than any one feature's.

        **Which feature it came from is not on screen** (Paul, 2026-09-08). It
        was named beside every number, and it is what the chips above already
        say; it stays in the tooltip, where a number that has to be traced back
        still can be.

        Drawn the way the feature box draws its own readings: same fields, same
        sheet, same wording. A field whose features disagree with no hard end to
        them — two holes of different diameters — says so rather than picking one.
      */}
      {readings.length > 0 ? (
        <div className="flex flex-col gap-1">
          <span className="text-2xs font-semibold tracking-wide text-zinc-500 uppercase">
            Worst case in the group
          </span>
          <dl className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1">
            {readings.map((reading) => (
              <div
                key={reading.name}
                className="flex items-center gap-1.5"
                // Every number says which features it was folded from: one a shop
                // cannot trace back to a feature is one they have to take on faith.
                title={traced(reading, nameOf, unit)}
              >
                <span className="shrink-0 text-zinc-600">
                  <MeasurementIcon measurement={reading.icon} />
                </span>
                <dd className="font-mono text-xs text-zinc-100">
                  {reading.value === null
                    ? 'differs'
                    : readingText({ unit: reading.unit, value: reading.value }, unit)}
                </dd>
                <dt className="text-2xs text-zinc-500">{reading.name}</dt>
              </div>
            ))}
          </dl>
        </div>
      ) : null}

      <div className="flex items-center gap-1.5">
        <Button size="sm" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        {/* A group of nothing is not a group, and a group with no tool is not an
          answer: the way out of either is Cancel, so the confirm says nothing
          it cannot do. */}
        <Button
          size="sm"
          disabled={tags.length === 0 || !picked || (results === 'each' && matching !== 'ready')}
          onClick={onConfirm}
        >
          {editing
            ? 'Save group'
            : /*
              **The button says what it does** (Paul, 2026-09-02: "create group
              button should be 'create group and add tool'"). Confirming a group
              is what puts its tool on the bill, and a button called *Create
              group* did not say that it was also ordering something.
            */
              results === 'each'
              ? 'Create group and add tools'
              : 'Create group and add tool'}
        </Button>
        {tags.length > 0 && results === 'each' && matching === 'pending' ? (
          <span role="status" className="text-2xs flex items-center gap-1 text-zinc-500">
            <span
              aria-hidden="true"
              className="size-2.5 animate-spin rounded-full border-2 border-zinc-700 border-t-info"
            />
            Finding compatible tools...
          </span>
        ) : null}
        {tags.length > 0 && results === 'each' && matching === 'error' ? (
          <span className="text-2xs text-danger">
            Unable to match tools. Change the group to retry.
          </span>
        ) : null}
        {tags.length > 0 && results === 'each' && matching === 'nothing-fits' ? (
          <span className="text-2xs text-zinc-500">
            Nothing in the catalog fits at least one feature.
          </span>
        ) : null}
        {tags.length > 0 && !picked && !(results === 'each' && matching !== 'ready') ? (
          <span className="text-2xs text-zinc-500">Pick a tool from the list below.</span>
        ) : null}
      </div>
    </div>
  )
}
