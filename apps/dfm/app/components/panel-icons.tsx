import type { ReactNode } from 'react'

import type { GeneratorIcon } from '../shared/generate'

/**
 * The small marks on the panels' buttons.
 *
 * Drawn here rather than borrowed from an icon set, because every one of them
 * has to say something this app means and nothing else: `required only` is not
 * a padlock in general, it is *the ways up nothing else can reach*. A set built
 * for the web gives you a padlock and leaves the rest to hope.
 *
 * They read at 12px on a one-line button, so each is two or three strokes at
 * most. The label is still there beside them — these are for finding a button
 * again once you know it, which is what an icon is for.
 */
const Frame = ({ children }: { children: ReactNode }) => (
  <svg
    aria-hidden="true"
    className="size-3 shrink-0"
    fill="none"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth={1.6}
    viewBox="0 0 16 16"
  >
    {children}
  </svg>
)

/** Pick directions — a pointer. You say which, and nothing is guessed. */
export const PickIcon = () => (
  <Frame>
    <path d="M3.5 2.5l9 4.5-4 1.5-1.5 4z" />
  </Frame>
)

/** From the rules — a list with a tick against it. The limits, applied. */
export const RulesIcon = () => (
  <Frame>
    <path d="M2.5 4h5M2.5 8h4M2.5 12h3" />
    <path d="M9 10l2 2 3.5-4" />
  </Frame>
)

/** Required only — a lock. What the geometry forces, and nothing more. */
export const RequiredIcon = () => (
  <Frame>
    <rect x={3.5} y={7} width={9} height={6} rx={1.2} />
    <path d="M5.75 7V5.25a2.25 2.25 0 1 1 4.5 0V7" />
  </Frame>
)

/** Required, filled — the same lock, and the rest fitted in around it. */
export const RequiredFilledIcon = () => (
  <Frame>
    <rect x={2} y={7} width={7} height={6} rx={1.2} />
    <path d="M3.75 7V5.5a1.75 1.75 0 1 1 3.5 0V7" />
    <path d="M12 6.5v6M15 8v4" />
  </Frame>
)

/**
 * From Toolpath — the mark itself.
 *
 * Copied from `toolpath_ui`'s `logo-mark.tsx`, paths and colours unchanged.
 * Everything else on these panels is a two-stroke glyph in the current text
 * colour; this one keeps its own green and its own square, because it is not a
 * word for a thing this app does — it is somebody else's answer arriving whole,
 * and the point of the button is that you can tell at a glance whose.
 *
 * Slightly larger than its neighbours: the detail inside the tile is fine, and
 * at 12px it closed up into a green square.
 */
export const ToolpathIcon = ({ className = 'size-3.5' }: { className?: string } = {}) => (
  <svg aria-hidden="true" className={`shrink-0 ${className}`} viewBox="0 0 28 28">
    <g fill="none" fillRule="evenodd">
      <path
        d="m24.1818182 0c2.1087236 0 3.8181818 1.70945823 3.8181818 3.81818182v20.36363638c0 2.1087236-1.7094582 3.8181818-3.8181818 3.8181818h-20.36363638c-2.10872359 0-3.81818182-1.7094582-3.81818182-3.8181818v-20.36363638c0-2.10872359 1.70945823-3.81818182 3.81818182-3.81818182z"
        fill="#68b688"
      />
      <g fill="#fff">
        <path d="m24.1818182 17.8181818c.7029078 0 1.2727273.5698194 1.2727273 1.2727273v5.0909091c0 .6909942-.5506672 1.2533731-1.2371031 1.2722383l-.0356242.000489h-10.1818182c-.7029079 0-1.2727273-.5698195-1.2727273-1.2727273 0-.7029079.5698194-1.2727273 1.2727273-1.2727273h8.4c.2811631 0 .5090909-.2279278.5090909-.5090909v-3.3090909c0-.7029079.5698194-1.2727273 1.2727273-1.2727273z" />
        <path d="m3.81818182 12.7272727c.70290786 0 1.27272727.5698194 1.27272727 1.2727273v8.4c0 .2811631.22792776.5090909.50909091.5090909h3.30909091c.70290786 0 1.27272729.5698194 1.27272729 1.2727273 0 .7029078-.56981943 1.2727273-1.27272729 1.2727273h-5.09090909c-.70290787 0-1.27272727-.5698195-1.27272727-1.2727273v-10.1818182c0-.7029079.5698194-1.2727273 1.27272727-1.2727273z" />
        <path d="m14 7.63636364c.7029079 0 1.2727273.56981941 1.2727273 1.27272727v10.18181819c0 .7029079-.5698194 1.2727273-1.2727273 1.2727273s-1.2727273-.5698194-1.2727273-1.2727273v-10.18181819c0-.70290786.5698194-1.27272727 1.2727273-1.27272727z" />
        <path d="m8.90909091 12.7272727c.70290786 0 1.27272729.5698194 1.27272729 1.2727273v5.0909091c0 .7029079-.56981943 1.2727273-1.27272729 1.2727273s-1.27272727-.5698194-1.27272727-1.2727273v-5.0909091c0-.7029079.56981941-1.2727273 1.27272727-1.2727273z" />
        <path d="m19.0909091 7.63636364c.7029079 0 1.2727273.56981941 1.2727273 1.27272727v5.09090909c0 .7029079-.5698194 1.2727273-1.2727273 1.2727273s-1.2727273-.5698194-1.2727273-1.2727273v-5.09090909c0-.70290786.5698194-1.27272727 1.2727273-1.27272727z" />
        <path d="m24.1818182 2.54545455c.7029078 0 1.2727273.5698194 1.2727273 1.27272727v10.18181818c0 .7029079-.5698195 1.2727273-1.2727273 1.2727273-.7029079 0-1.2727273-.5698194-1.2727273-1.2727273v-8.4c0-.28116315-.2279278-.50909091-.5090909-.50909091h-3.3090909c-.7029079 0-1.2727273-.56981941-1.2727273-1.27272727 0-.70290787.5698194-1.27272727 1.2727273-1.27272727z" />
        <path d="m14 2.54545455c.7029079 0 1.2727273.5698194 1.2727273 1.27272727 0 .70290786-.5698194 1.27272727-1.2727273 1.27272727h-8.4c-.28116315 0-.50909091.22792776-.50909091.50909091v3.30909091c0 .70290786-.56981941 1.27272729-1.27272727 1.27272729-.70290787 0-1.27272727-.56981943-1.27272727-1.27272729v-5.09090909c0-.69099417.55066719-1.25337313 1.23710302-1.27223832l.03562425-.00048895z" />
      </g>
    </g>
  </svg>
)

/** By feature — one face of a part, and what owns it. */
export const FeatureIcon = () => (
  <Frame>
    <path d="M8 2l5.5 3v6L8 14 2.5 11V5z" />
    <path d="M8 8l5.5-3M8 8v6M8 8L2.5 5" />
  </Frame>
)

/** By direction — the arrow, the same one the part wears. */
export const DirectionIcon = () => (
  <Frame>
    <path d="M8 2.5v11M4.5 10L8 13.5 11.5 10" />
  </Frame>
)

/** Create — a plus. The one that adds to the part rather than reading it. */
export const CreateIcon = () => (
  <Frame>
    <path d="M8 3.5v9M3.5 8h9" />
  </Frame>
)

/** Fill all — a bar filling up. Everything you hold, decided at once. */
export const FillIcon = () => (
  <Frame>
    <rect x={2} y={5} width={12} height={6} rx={1.2} />
    <path d="M2 11h7" strokeWidth={3} />
  </Frame>
)

/**
 * The mark for one offer, by the name it gives itself in `GENERATORS`.
 *
 * A lookup rather than a `switch` at the call site, so adding an offer is one
 * edit in one file and a missing mark is a type error rather than a blank.
 */
export const GENERATOR_ICONS: Record<GeneratorIcon, () => ReactNode> = {
  pick: PickIcon,
  rules: RulesIcon,
  required: RequiredIcon,
  'required-filled': RequiredFilledIcon,
  toolpath: ToolpathIcon,
  fill: FillIcon,
}
