import { XIcon } from '@phosphor-icons/react'
import { Button } from '@toolpath/ui'
import type { Results } from 'shared/feature-list'

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
}: GroupEditorProps) => (
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
