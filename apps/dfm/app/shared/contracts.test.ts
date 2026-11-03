import { describe, expect, test } from 'vitest'
import { parseAnalysisEvent, toPublicInspectionReport } from './contracts'
import type { PartReport } from './contracts'

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

describe('a failure that is a choice of body', () => {
  const body = {
    index: 1,
    name: null,
    faceCount: 6,
    boundingBox: { lower: { x: 0, y: 0, z: 0 }, upper: { x: 10, y: 20, z: 5 } },
  }

  test('carries well-formed bodies and rejects malformed ones', () => {
    const failed = (bodies: unknown) => ({ status: 'failed', message: 'Choose one', bodies })
    expect(parseAnalysisEvent(failed([body]))).toEqual(failed([body]))
    expect(() => parseAnalysisEvent(failed([]))).toThrow()
    expect(() => parseAnalysisEvent(failed([{ ...body, index: -1 }]))).toThrow()
  })
})
