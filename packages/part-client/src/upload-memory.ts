/**
 * The CAD files uploaded in this tab, by the part each created — so a file
 * that turns out to hold several bodies can be sent again for the one chosen
 * without asking for it a second time.
 *
 * In memory only, and only the last few: a `File` is the user's own data, and
 * it goes with the tab. A reload, or a part opened by its link, finds nothing
 * here and asks for the file again.
 */
const KEPT = 4

const files = new Map<string, File>()

export const rememberUpload = (partId: string, file: File): void => {
  files.delete(partId)
  files.set(partId, file)
  for (const oldest of files.keys()) {
    if (files.size <= KEPT) {
      break
    }
    files.delete(oldest)
  }
}

export const uploadedFile = (partId: string): File | undefined => files.get(partId)
