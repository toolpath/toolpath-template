import { DIRECTION_COLORS } from '@toolpath/viewer'

/**
 * The viewer's direction cycle, as CSS.
 *
 * Read from the package rather than copied, so a dot in a list, a chip in the
 * panel and an arrow on the part are the same colour by construction — the
 * palette is an identity, and it stops being one the moment two places disagree
 * about it.
 */
export const directionCss = (index: number): string => {
  const hex = DIRECTION_COLORS[index % DIRECTION_COLORS.length] ?? 0x64748b
  return `#${hex.toString(16).padStart(6, '0')}`
}
