import { Button } from '@toolpath/ui'

import { directionCss } from '../shared/direction-colors'
import type { SetupOffer } from '../shared/setup-offers'

/**
 * Which ways up you will hold, before the rules decide what each one cuts.
 *
 * `from the rules` used to answer this itself, buying a direction at a time on
 * an estimate of what each unlocks — and `generate.ts` records what that costs:
 * on a part that forces three ways up, it reaches 95% across **five**, while
 * choosing those three by hand and letting the same allocator fill them reaches
 * 100%. The buying loop was the part that was wrong.
 *
 * So the question is asked instead of guessed, and it is asked in the terms
 * somebody decides in: how much of the part each way up can reach, how many
 * readings that is, and which of them the geometry leaves no choice about.
 */
export const SetupChooser = ({
  offers,
  chosen,
  onMove,
  splitPasses,
  partial,
  missed,
  onToggle,
  onSplitPasses,
  onPartial,
  onConfirm,
  onRecommend,
  onCancel,
}: {
  offers: readonly SetupOffer[]
  /**
   * The ways up chosen, **in the order they will be run**.
   *
   * An order rather than a set. A plan is a sequence a shop works through, and
   * before this it came out in the Engine's own direction order — which means
   * nothing to anybody holding the part. Ticking builds the order; the arrows
   * change it after the fact, because the order somebody wants is not always
   * the order they thought of it in.
   */
  chosen: ReadonlyArray<number>
  splitPasses: boolean
  partial: boolean
  /** What this choice would leave uncut, as a share of what anything can reach. */
  missed: number
  onToggle: (index: number) => void
  /** Move one way up earlier or later in the run. */
  onMove: (index: number, by: -1 | 1) => void
  onSplitPasses: (split: boolean) => void
  onPartial: (partial: boolean) => void
  onConfirm: () => void
  /** Hand the choice back: buy whatever the rules think is worth holding. */
  onRecommend: () => void
  onCancel: () => void
}) => (
  <section className="mt-2 flex flex-col gap-2 rounded border border-edge bg-ground/40 p-2 text-xs">
    <div>
      <h3 className="text-2xs font-bold uppercase tracking-wider text-ink-muted">
        Which ways up will you hold?
      </h3>
      <p className="mt-0.5 text-2xs leading-4 text-ink-dim">
        Ticking builds the order you will run them in; the arrows change it. The rules decide what
        each one cuts. Say no to a required one and the ground only it reaches stays uncut.
      </p>
    </div>

    {/*
      Held first, in the order they will run; the rest below, as the Engine
      reports them.

      The order used to live only in the badge — the row stayed where it was and
      a number on it changed, so `1` could sit below `3` and the list was
      claiming two different orders at once. A sequence has to read down the
      page or it is not one.
    */}
    <ul className="flex flex-col">
      {[...offers]
        .sort((a, b) => {
          const at = chosen.indexOf(a.index)
          const to = chosen.indexOf(b.index)
          if (at === -1 && to === -1) return a.index - b.index
          if (at === -1) return 1
          if (to === -1) return -1
          return at - to
        })
        .map((offer) => {
          const at = chosen.indexOf(offer.index)
          const held = at !== -1

          return (
            <li key={offer.index} className="flex items-center gap-1">
              <button
                type="button"
                aria-pressed={held}
                onClick={() => onToggle(offer.index)}
                className={`flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-2xs transition ${
                  held ? 'bg-info/15 text-ink-strong' : 'text-ink-dim hover:bg-surface'
                }`}
              >
                {/*
                Its place in the run, or an empty box.

                A tick said only *yes*, and the order was the Engine's direction
                index — so a plan came out in an order nobody chose and nothing
                on screen admitted there was an order at all. The figure is the
                setup number a shop will work to.
              */}
                <span
                  aria-hidden="true"
                  className={`grid size-3.5 shrink-0 place-items-center rounded-sm border text-2xs tabular-nums ${
                    held ? 'border-info bg-info/30 text-info' : 'border-edge-strong'
                  }`}
                >
                  {held ? at + 1 : ''}
                </span>
                <span
                  aria-hidden="true"
                  className="size-1.5 shrink-0 rounded-full"
                  style={{ background: directionCss(offer.index) }}
                />
                <span className="w-10 shrink-0 font-semibold">{offer.label}</span>

                {offer.required ? (
                  /* A fact about the geometry, not a recommendation: something is
                   reachable from here and nowhere else. */
                  <span
                    className="shrink-0 rounded bg-warning/20 px-1 text-2xs font-semibold text-warning"
                    title="Something is reachable from here and nowhere else"
                  >
                    required
                  </span>
                ) : null}

                <span className="ml-auto shrink-0 tabular-nums text-ink-dim">
                  {offer.features} {offer.features === 1 ? 'reading' : 'readings'}
                </span>
                <span className="w-14 shrink-0 text-right tabular-nums">
                  {(offer.share * 100).toFixed(0)}% of part
                </span>
              </button>

              {/*
              Only where there is an order to change.

              Two arrows against every row would be a column of controls that do
              nothing on most of them — and the ones that are not held have no
              place in the run to move.
            */}
              <span className="flex shrink-0 flex-col">
                {([-1, 1] as const).map((by) => (
                  <button
                    key={by}
                    type="button"
                    disabled={!held || (by === -1 ? at === 0 : at === chosen.length - 1)}
                    onClick={() => onMove(offer.index, by)}
                    aria-label={`Run ${offer.label} ${by === -1 ? 'earlier' : 'later'}`}
                    title={`Run ${offer.label} ${by === -1 ? 'earlier' : 'later'}`}
                    className="px-1 text-2xs leading-none text-ink-faint transition enabled:hover:text-ink-strong disabled:opacity-0"
                  >
                    {by === -1 ? '▲' : '▼'}
                  </button>
                ))}
              </span>
            </li>
          )
        })}
    </ul>

    {/*
      What the choice costs, while it is still a choice.

      "You will not reach 12% of this part" is a fact about the decision, and
      finding it out from a coverage bar afterwards means undoing the decision
      to change it.
    */}
    {missed <= 0 ? (
      <p className="rounded border border-success/40 bg-success/10 px-2 py-1 text-2xs text-success">
        These reach everything the Engine can see a way to cut.
      </p>
    ) : (
      <p className="rounded border border-warning/40 bg-warning/10 px-2 py-1 text-2xs text-warning">
        {(missed * 100).toFixed(0)}% of what could be reached is not reachable from these.
      </p>
    )}

    {/*
      A face belongs to several readings, and only one of them can cut it — but
      the rest of those readings are still the right answer for their *other*
      faces. Without this, one contested face costs a reading every face it
      covers, and they go to whatever smaller readings come after it.
    */}
    <label className="flex items-start gap-2 text-2xs leading-4 text-ink-muted">
      <input
        type="checkbox"
        checked={partial}
        onChange={(event) => onPartial(event.target.checked)}
        className="mt-0.5 size-3 shrink-0 accent-info"
      />
      <span>
        <span className="font-semibold text-ink-body">
          Split a feature where another way up cuts part of it better
        </span>
        <br />
        Each face then goes to whatever cuts it best, and the reading it came from still cuts the
        rest. Off, a reading is taken whole or not at all.
      </span>
    </label>

    {/*
      Roughing and finishing are different jobs, and the generator has never been
      able to say so — every assignment it wrote named one setup for both.
    */}
    <label className="flex items-start gap-2 text-2xs leading-4 text-ink-muted">
      <input
        type="checkbox"
        checked={splitPasses}
        onChange={(event) => onSplitPasses(event.target.checked)}
        className="mt-0.5 size-3 shrink-0 accent-info"
      />
      <span>
        <span className="font-semibold text-ink-body">
          Let roughing and finishing use different ways up
        </span>
        <br />
        Each pass is then decided on its own, both on the best reading — so today they agree, and
        they will differ the moment anything distinguishes them. Off, one way up does both.
      </span>
    </label>

    {/*
      Or don't choose at all.
      
      Buying ways up is what this panel took away from the rules, and it is not
      always the wrong answer — on a part somebody does not know yet, "show me
      what you would do" is the first question, and being made to answer a
      harder one before seeing anything is worse than a plan that spends a
      setup too many. It says what it costs, so nobody presses it by accident.
    */}
    <button
      type="button"
      onClick={onRecommend}
      className="rounded border border-edge px-2 py-1.5 text-left transition hover:border-edge-strong hover:bg-surface"
    >
      <span className="block text-2xs font-semibold text-ink-strong">
        Or use whatever ways up the rules recommend
      </span>
      <span className="block text-2xs leading-4 text-ink-dim">
        They buy one at a time on what each unlocks, which tends to spend a setup or two more than
        choosing by hand
      </span>
    </button>

    {/*
      The two ends of the decision, given room to be one.

      They were a pair of small buttons crowded against the running count, which
      read as more settings rather than as the end of the panel. A rule above
      them says the choosing is over; the count sits at the far end where it is
      a caption on the press rather than a label competing with it.

      Cancel is quiet on purpose — leaving is always available and never the
      thing somebody came to do — and the press that acts says what it will do
      to how many, so the count is read where it is about to be spent.
    */}
    <div className="-mx-2 -mb-2 mt-1 flex items-center gap-2 border-t border-edge bg-ground/60 px-2.5 py-2">
      <button
        type="button"
        onClick={onCancel}
        className="rounded px-2 py-1 text-2xs font-medium text-ink-dim transition hover:bg-surface hover:text-ink-strong focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-info"
      >
        Cancel
      </button>
      <span className="ml-auto text-2xs text-ink-dim">
        {chosen.length > 1 ? 'in the order shown' : null}
      </span>
      <Button size="md" disabled={chosen.length === 0} onClick={onConfirm}>
        {chosen.length === 0
          ? 'Map features'
          : `Map features from ${String(chosen.length)} ${chosen.length === 1 ? 'way up' : 'ways up'}`}
      </Button>
    </div>
  </section>
)
