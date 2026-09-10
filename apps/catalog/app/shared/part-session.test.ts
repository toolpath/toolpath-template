import { afterEach, describe, expect, it } from 'vitest'
import type { PublicInspectionReport } from '@toolpath/part-contracts'
import { forgetPart, openPart, orderListHref, partHref, rememberPart } from './part-session'

const remembered = { partId: 'part-1', jobId: 'job-1' }

afterEach(() => {
  forgetPart()
})

describe('the part a page is on', () => {
  it('reads the URL, which outlives the memory-only session', () => {
    expect(openPart(null, 'part-9', 'job-9')).toEqual({ partId: 'part-9', jobId: 'job-9' })
  })

  /**
   * The defect this exists for: a reload on the order list emptied the session,
   * the header fell back to `/parts`, and the way back to the part was an
   * upload form (Paul, 2026-09-09).
   */
  it('takes the URL over a session naming a different part', () => {
    expect(openPart(remembered, 'part-9', 'job-9')).toEqual({ partId: 'part-9', jobId: 'job-9' })
  })

  it('falls back to the session where the URL names no part', () => {
    expect(openPart(remembered, undefined, null)).toEqual(remembered)
  })

  it('is nothing at all where neither answers', () => {
    expect(openPart(null, undefined, null)).toBeNull()
    // A part with no job is not a page anything can be linked to.
    expect(openPart(null, 'part-9', null)).toBeNull()
  })

  it('links the part and its order list from a ref alone', () => {
    rememberPart({ ...remembered, report: {} as PublicInspectionReport })

    expect(partHref(remembered)).toBe('/parts/part-1?job=job-1')
    expect(orderListHref(remembered)).toBe('/parts/part-1/order-list?job=job-1')
  })
})
