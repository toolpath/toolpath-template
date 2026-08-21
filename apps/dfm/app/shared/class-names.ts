/** Minimal class composition for app components. The shared UI package does not export `cn`. */
export const classNames = (...values: Array<string | false | null | undefined>): string =>
  values.filter((value): value is string => Boolean(value)).join(' ')
