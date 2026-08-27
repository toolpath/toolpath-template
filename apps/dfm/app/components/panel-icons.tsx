import { CubeIcon, GaugeIcon } from '@phosphor-icons/react'
import type { ReactNode } from 'react'

import type { GeneratorIcon } from 'shared/generate'
import type { PaintMode } from 'shared/paint'

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

/**
 * The three standing washes, each with a glyph.
 *
 * `Direction` is the same mark the mapping panel's *By direction* wears, on
 * purpose: it is the same idea in two places, and a second drawing of it would
 * read as a second idea.
 *
 * Plain is the part with nothing said about it, so it wears the part. Difficulty
 * is a reading off a scale, so it wears the thing that reads a scale.
 */
export const PAINT_MODE_ICONS: Record<PaintMode, () => ReactNode> = {
  plain: () => <CubeIcon className="size-3.5" />,
  directions: () => <DirectionIcon />,
  difficulty: () => <GaugeIcon className="size-3.5" />,
}

/*
 * Three marks from the Toolpath UI set, redrawn here rather than imported.
 *
 * They live in `toolpath_ui`'s icon set, which is a **different package** to
 * the `@toolpath/ui` this app depends on — the name exists three times across
 * the repos, and an import that resolved to the wrong one would be a puzzle
 * rather than an error. Copying the path is honest about that; adding a
 * dependency on a second UI kit to reach three glyphs would not be.
 *
 * `fill-current` rather than `stroke`, which is how that set draws.
 */

/** Grid — the Toolpath UI mark, in place of the icon set's four-square. */
export const GridIcon = () => (
  <svg viewBox="0 0 24 24" className="pointer-events-none size-3.5 fill-current" aria-hidden="true">
    <path d="M4 22q-.825 0-1.412-.587Q2 20.825 2 20V4q0-.825.588-1.413Q3.175 2 4 2h16q.825 0 1.413.587Q22 3.175 22 4v16q0 .825-.587 1.413Q20.825 22 20 22Zm0-6v4h4v-4Zm6 0v4h4v-4Zm6 4h4v-4h-4ZM4 14h4v-4H4Zm6 0h4v-4h-4Zm6 0h4v-4h-4ZM8 4H4v4h4Zm2 4h4V4h-4Zm6 0h4V4h-4Z" />
  </svg>
)

/** Axes — three arms from an origin, the same set's mark. */
export const AxisIcon = () => (
  <svg viewBox="0 0 24 24" className="pointer-events-none size-3.5 fill-current" aria-hidden="true">
    <path d="M13,3 L13.0004264,3.15998383 C13.0007555,3.16009681 13.0010845,3.16020985 13.0014135,3.16032296 L13,12 L17,16 L21,19.9248301 L21,21 L18.9214891,21 L16,17.95 L12,13.95 L8,17.95 L4.98869092,21 L3,21 L3,20.0807487 L7,16 L11,12 L10.999582,3.15998093 L11,3.159 L11,3 L13,3 Z" />
  </svg>
)

/** A banana, for scale. It is exactly as serious as it looks, and it works. */
export const BananaIcon = () => (
  <svg
    viewBox="0 0 576 512"
    className="pointer-events-none size-3.5 fill-current"
    aria-hidden="true"
  >
    <path d="M284.2 245.6c12.99 6.929 25.35 15.14 36.08 25.8L334.5 285.6l65.75-23.47c14.75-5.265 30.18-7.849 45.81-8.389c1.154-10.73 1.764-21.38 1.764-31.87c0-118.5-81.33-221.9-119.7-221.9c-21.01 0-40.91 17.04-40.91 39.25c0 16.18 16.74 41.9 16.74 103C303.1 170.1 300.6 203.1 284.2 245.6zM575.1 389.6c0-3.687-.8637-7.429-2.687-10.93l-15.12-29.11c-21.05-40.53-63.08-64.51-106.9-64.51c-13.43 0-27.02 2.252-40.22 6.969l-84.84 30.27l-28.59-28.41C274.4 270.9 243.7 258.1 212.8 258.1c-23.72 0-47.57 6.97-68.29 21.2L106.3 306.4c-6.732 4.631-10.35 12.07-10.35 19.63c0 14.93 12.7 23.87 24.04 23.87c4.695 0 9.443-1.376 13.61-4.26l38.13-26.23c12.43-8.525 26.71-12.69 40.91-12.69c10.64 0 21.24 2.339 30.97 6.934c-50.62 62.23-128.3 99.85-211.4 99.85C14.42 413.5 0 427.8 0 445.5v31.38c0 17.68 14.66 32.02 32.46 32.02l28.98 .0009c14.15 0 34.69 1.098 59.07 1.098c93.51 0 243.4-16.15 304.8-172.4c9.021-3.22 17.95-4.712 26.53-4.712c27.65 0 51.7 15.49 63.7 38.55l15.12 29.11c3.484 6.723 11.74 12.98 21.41 12.98C564.1 413.6 575.1 403.8 575.1 389.6z" />
  </svg>
)
