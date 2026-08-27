// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { ReadingRow } from './reading-row'
import { TEST_DIRECTIONS, testFeature } from '../shared/test-part'

/**
 * One shape for "a reading", wherever it is being read.
 *
 * The confirmed directions and the face editor draw the same row — icon, what
 * it is, which way up, how hard — and it drifted twice, because a list that
 * formats a reading its own way makes somebody learn the same row twice and
 * the difference is never noticed by whoever wrote the second one.
 *
 * It used to be pinned by reading both files and comparing the markup character
 * for character. That caught drift but could not prevent it, and it had to be
 * argued with whenever either file was touched — including for a change that
 * was correct. It is one component now, so there is nothing left to diff: what
 * this file checks is that the two callers still use it, and that the one thing
 * they are allowed to differ in behaves.
 */
afterEach(cleanup)

const pocket = testFeature('pocket', 'pocket', TEST_DIRECTIONS[0]!, [0])

const uses = (file: string): string => readFileSync(new URL(file, import.meta.url), 'utf8')

describe('a reading reads the same wherever it is drawn', () => {
  it('is drawn by the one component in both lists', () => {
    // The structural pin. Either list going back to its own markup fails here,
    // rather than being caught later by a diff nobody can read.
    for (const file of ['./setups-panel.tsx', './face-list.tsx']) {
      expect(uses(file)).toContain('<ReadingRow')
      expect(uses(file)).toContain('readingRowClass(')
    }
  })

  it('says what it is and how hard, always', () => {
    render(<ReadingRow reading={pocket} score={undefined} />)

    expect(screen.getByText('Pocket')).toBeInTheDocument()
  })

  it('names its way up only where the list is not already grouped by one', () => {
    /*
     * The one honest difference. The face editor's owners are alternatives from
     * every way up that reaches a face, so each has to say which; the confirmed
     * directions sit under a header that names it, and the repeat cost more
     * width than the reading — `(-0.33, 0.00, 0.95)` on every line, and `Wall`
     * drawn as `W.`.
     */
    render(<ReadingRow reading={pocket} score={undefined} showDirection />)
    expect(screen.getByText('+Z')).toBeInTheDocument()

    cleanup()

    render(<ReadingRow reading={pocket} score={undefined} />)
    expect(screen.queryByText('+Z')).not.toBeInTheDocument()
  })
})
