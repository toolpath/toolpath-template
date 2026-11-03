import { describe, expect, test } from 'vitest'
import { rememberUpload, uploadedFile } from './upload-memory.js'

const file = (name: string) => new File(['STEP'], name)

describe('the files uploaded in this tab', () => {
  test('are found again by the part each created', () => {
    const source = file('bracket.step')
    rememberUpload('part-a', source)
    expect(uploadedFile('part-a')).toBe(source)
    expect(uploadedFile('part-unknown')).toBeUndefined()
  })

  test('keep only the last few, forgetting the oldest first', () => {
    for (const id of ['1', '2', '3', '4', '5']) {
      rememberUpload(`part-${id}`, file(`${id}.step`))
    }
    expect(uploadedFile('part-1')).toBeUndefined()
    expect(uploadedFile('part-2')?.name).toBe('2.step')
    expect(uploadedFile('part-5')?.name).toBe('5.step')
  })

  test('counts a file remembered again as the newest', () => {
    for (const id of ['1', '2', '3', '4']) {
      rememberUpload(`part-${id}`, file(`${id}.step`))
    }
    rememberUpload('part-1', file('1-again.step'))
    rememberUpload('part-6', file('6.step'))
    expect(uploadedFile('part-1')?.name).toBe('1-again.step')
    expect(uploadedFile('part-2')).toBeUndefined()
  })
})
