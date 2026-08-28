/**
 * A section heading, the same everywhere.
 *
 * Small, bold, upper-case and tracked out, sitting well above what it names.
 * It is the top of one scale the whole app reads by: headings at this size,
 * rows a step up at `text-xs`, and anything nested or derived a step down at
 * `text-2xs`. Panels that invent their own sizes stop looking like the same
 * app the moment they sit side by side, which is what the summary and the
 * rules do.
 */
export const Heading = ({ children }: { children: string }) => (
  <h3 className="mb-1 mt-5 text-2xs font-bold uppercase tracking-wider text-ink-dim first:mt-0">
    {children}
  </h3>
)
