import { describe, expect, it, vi } from 'vitest'
import { saveFile } from './save-file'

describe('handing a file to the browser', () => {
  it('names it, puts it in the document, and clicks it', () => {
    const link = {
      href: '',
      download: '',
      style: {} as CSSStyleDeclaration,
      click: vi.fn(),
      remove: vi.fn(),
    }
    const appended: Array<unknown> = []
    const revoked: Array<string> = []
    const later: Array<() => void> = []

    saveFile('part-tools.json', '{}', 'application/json', {
      document: {
        createElement: () => link as unknown as HTMLAnchorElement,
        body: { appendChild: (each: unknown) => appended.push(each) },
      } as unknown as Pick<Document, 'createElement' | 'body'>,
      url: {
        createObjectURL: () => 'blob:the-file',
        revokeObjectURL: (href: string) => revoked.push(href),
      } as unknown as Pick<typeof URL, 'createObjectURL' | 'revokeObjectURL'>,
      later: (release) => later.push(release),
    })

    expect(link.download).toBe('part-tools.json')
    expect(link.href).toBe('blob:the-file')
    // In the document before the click: Firefox ignores a detached one.
    expect(appended).toEqual([link])
    expect(link.click).toHaveBeenCalled()

    /**
     * **And still alive when the click returns.** Revoking in the same task is
     * what stopped the download happening at all.
     */
    expect(revoked).toEqual([])

    later.forEach((release) => release())
    expect(revoked).toEqual(['blob:the-file'])
    expect(link.remove).toHaveBeenCalled()
  })
})
