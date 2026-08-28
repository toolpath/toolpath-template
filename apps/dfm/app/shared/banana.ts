const STORAGE_KEY = 'part-viewer:banana'

/**
 * Whether the banana is standing beside the part.
 *
 * A six-inch banana, modelled at 154 mm, laid on the ground plane next to
 * whatever is on screen. It is a joke that happens to be the fastest honest
 * answer to *how big is this actually* — a part fills the viewport whatever its
 * size, and the grid answers in numbers somebody has to read. The banana
 * answers before you have finished asking.
 *
 * Off by default and remembered, the way the grid and the zoom target are. It
 * is furniture, not a control: it says something about the part rather than
 * doing something to it.
 */
export const loadBanana = (storage: Pick<Storage, 'getItem'> | null): boolean =>
  storage?.getItem(STORAGE_KEY) === 'on'

export const saveBanana = (storage: Pick<Storage, 'setItem'> | null, shown: boolean): void => {
  storage?.setItem(STORAGE_KEY, shown ? 'on' : 'off')
}
