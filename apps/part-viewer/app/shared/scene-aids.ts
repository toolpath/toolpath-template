const STORAGE_KEY = 'part-viewer:scene-aids'

/**
 * Whether the scene's reference furniture — the ground grid and the axis triad
 * — is drawn.
 *
 * One switch for both: they answer the same question, which is where the part
 * sits and how big it is, and they are answering it behind the part rather than
 * on it. Off by default — the part is what somebody opened this page to read,
 * and a grid line read through a bore is worse than no grid at all. The switch
 * is there for the times the question is worth a glance.
 *
 * The view cube is not in here. It is a control, not furniture: it does
 * something when clicked.
 */
export function loadShowAids(storage: Pick<Storage, 'getItem'> | null): boolean {
  return storage?.getItem(STORAGE_KEY) === 'on'
}

export function saveShowAids(storage: Pick<Storage, 'setItem'> | null, shown: boolean): void {
  storage?.setItem(STORAGE_KEY, shown ? 'on' : 'off')
}
