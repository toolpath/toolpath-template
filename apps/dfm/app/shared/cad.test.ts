import { describe, expect, test } from 'vitest'
import { MAX_UPLOAD_BYTES, validateCadFile } from './cad'

describe('CAD upload validation', () => {
  test('accepts a supported non-empty file', () => {
    expect(validateCadFile(new File(['STEP'], 'fixture.step'))).toBeNull()
  })

  test('rejects unsupported, empty, and oversized files before a request starts', () => {
    expect(validateCadFile(new File(['text'], 'fixture.txt'))).toContain('Supported files')
    expect(validateCadFile(new File([], 'fixture.step'))).toContain('non-empty')
    expect(
      validateCadFile(new File([new Uint8Array(MAX_UPLOAD_BYTES + 1)], 'fixture.step')),
    ).toContain('100 MiB')
  })
})
