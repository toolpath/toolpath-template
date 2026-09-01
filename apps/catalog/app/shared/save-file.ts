/**
 * Handing a file to the browser, so that it actually arrives.
 *
 * **The download was doing nothing** (Paul, 2026-09-01: "Fusion library
 * download from the order list… it doesn't work at all right now"). The page
 * built an object URL, clicked a detached `<a download>` and revoked the URL on
 * the very next line — synchronously, before the browser had begun reading it.
 * Two rules, and both of them are why:
 *
 * - the anchor has to be **in the document** when it is clicked, or Firefox
 *   ignores the click entirely;
 * - the object URL has to outlive the click, so it is revoked on a later task
 *   rather than in the same one.
 *
 * Pure but for the two globals it is given, which is what lets it be tested
 * without a browser.
 */
export interface SaveTargets {
  readonly document: Pick<Document, 'createElement' | 'body'>
  readonly url: Pick<typeof URL, 'createObjectURL' | 'revokeObjectURL'>
  /** Called with the cleanup; the browser's own `setTimeout` in the application. */
  readonly later: (release: () => void) => void
}

export const saveFile = (
  name: string,
  contents: string,
  type: string,
  { document, url, later }: SaveTargets,
): void => {
  const href = url.createObjectURL(new Blob([contents], { type }))
  const link = document.createElement('a')
  link.href = href
  link.download = name
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  later(() => {
    link.remove()
    url.revokeObjectURL(href)
  })
}

/** The same, against the real browser. */
export const saveInBrowser = (name: string, contents: string, type: string): void =>
  saveFile(name, contents, type, {
    document: globalThis.document,
    url: URL,
    later: (release) => {
      globalThis.setTimeout(release, 0)
    },
  })
