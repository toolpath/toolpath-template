import { describe, expect, test } from 'vitest'
import {
  isPartBodies,
  parseAnalysisEvent,
  parseInspectionEvent,
  toPublicInspectionReport,
} from './contracts.js'
import type { PartReport } from './contracts.js'

describe('public inspection report', () => {
  test('never serializes Engine-issued artifact URLs', () => {
    const report = {
      partId: 'part-1',
      reportId: 'report-1',
      jobId: 'job-1',
      kernelVersion: 'test',
      units: { length: 'mm', angle: 'deg' },
      regions: [],
      features: [],
      candidateDirections: [],
      discoveredDirections: null,
      addedDirections: null,
      directionZBounds: null,
      turnability: null,
      turning: null,
      meshPointCount: 0,
      meshTriangleCount: 0,
      thumbnailUrl: 'https://engine.test/thumbnail?signature=secret',
      meshStlUrl: 'https://engine.test/mesh.stl?signature=secret',
      meshGlbUrl: 'https://engine.test/mesh.glb?signature=secret',
    } as PartReport

    const safe = toPublicInspectionReport(report)
    expect(safe).toMatchObject({ hasThumbnail: true, hasMeshStl: true, hasMeshGlb: true })
    expect(JSON.stringify(safe)).not.toContain('engine.test')
    expect(JSON.stringify(safe)).not.toContain('signature=secret')
  })

  test('rejects malformed analysis events before they reach React state', () => {
    expect(() =>
      parseAnalysisEvent({ status: 'pending', progress: 'soon', message: 'Queued' }),
    ).toThrow()
    expect(parseAnalysisEvent({ status: 'failed', message: 'Analysis failed' })).toEqual({
      status: 'failed',
      message: 'Analysis failed',
    })
  })
})

const body = (index: number, name: string | null = `Body ${index}`) => ({
  index,
  name,
  faceCount: 6,
  boundingBox: { lower: { x: 0, y: 0, z: 0 }, upper: { x: 10, y: 20, z: 5 } },
})

describe('an analysis failure', () => {
  test("no longer carries bodies: a choice of body is the inspection's, not the part's", () => {
    expect(
      parseAnalysisEvent({ status: 'failed', message: 'No', bodies: [body(0), body(1)] }),
    ).toEqual({ status: 'failed', message: 'No' })
  })
})

describe('the inspection of an uploaded file', () => {
  test('ends in its bodies, named or not', () => {
    const event = { status: 'ready', bodies: [body(0), body(1, null)] }
    expect(parseInspectionEvent(event)).toEqual(event)
    expect(parseInspectionEvent({ status: 'pending', progress: null, message: 'Reading' })).toEqual(
      { status: 'pending', progress: null, message: 'Reading' },
    )
    expect(parseInspectionEvent({ status: 'failed', message: 'No solid body' })).toEqual({
      status: 'failed',
      message: 'No solid body',
    })
  })

  test('rejects a malformed body list rather than dropping it', () => {
    const ready = (bodies: unknown) => ({ status: 'ready', bodies })
    expect(() => parseInspectionEvent(ready([]))).toThrow()
    expect(() => parseInspectionEvent(ready('two'))).toThrow()
    expect(() => parseInspectionEvent(ready([{ ...body(0), index: -1 }]))).toThrow()
    expect(() => parseInspectionEvent(ready([{ ...body(0), index: 0.5 }]))).toThrow()
    expect(() => parseInspectionEvent(ready([{ ...body(0), name: undefined }]))).toThrow()
    expect(() => parseInspectionEvent(ready([{ ...body(0), faceCount: '6' }]))).toThrow()
    expect(() =>
      parseInspectionEvent(ready([{ ...body(0), boundingBox: { lower: { x: 0, y: 0 } } }])),
    ).toThrow()
    expect(() => parseInspectionEvent({ status: 'ready' })).toThrow()
    expect(() => parseInspectionEvent('ready')).toThrow()
  })

  test('refuses two bodies under one index, and an index past the last a part can name', () => {
    expect(isPartBodies([body(0), body(1)])).toBe(true)
    expect(isPartBodies([body(1), body(1, 'Again')])).toBe(false)
    expect(isPartBodies([body(999_999)])).toBe(true)
    expect(isPartBodies([body(1_000_000)])).toBe(false)
  })
})
