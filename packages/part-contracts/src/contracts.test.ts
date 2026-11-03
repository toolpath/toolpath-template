import { describe, expect, test } from 'vitest'
import { bodyChoiceEvent, parseAnalysisEvent, toPublicInspectionReport } from './contracts.js'
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

describe('a failure that is a choice of body', () => {
  test('carries well-formed bodies through the parser', () => {
    const event = { status: 'failed', message: 'Choose one', bodies: [body(0), body(1, null)] }
    expect(parseAnalysisEvent(event)).toEqual(event)
  })

  test('rejects a malformed body list rather than dropping it', () => {
    const failed = (bodies: unknown) => ({ status: 'failed', message: 'Choose one', bodies })
    expect(() => parseAnalysisEvent(failed([]))).toThrow()
    expect(() => parseAnalysisEvent(failed('two'))).toThrow()
    expect(() => parseAnalysisEvent(failed([{ ...body(0), index: -1 }]))).toThrow()
    expect(() => parseAnalysisEvent(failed([{ ...body(0), index: 0.5 }]))).toThrow()
    expect(() => parseAnalysisEvent(failed([{ ...body(0), name: undefined }]))).toThrow()
    expect(() => parseAnalysisEvent(failed([{ ...body(0), faceCount: '6' }]))).toThrow()
    expect(() =>
      parseAnalysisEvent(failed([{ ...body(0), boundingBox: { lower: { x: 0, y: 0 } } }])),
    ).toThrow()
  })

  test('maps a multiple-bodies or body-not-found job, and nothing else', () => {
    // The SDK's body leaves out a name it has none for, where the event states `null`.
    const unnamed = { index: 0, faceCount: 6, boundingBox: body(0).boundingBox }
    const named = { ...unnamed, index: 1, name: 'Body 1' }
    const job = (error: string | null, bodies: Array<typeof unnamed> = [unnamed, named]) => ({
      status: 'failed' as const,
      error,
      bodies,
    })

    expect(bodyChoiceEvent(job('multiple_bodies: the file holds 2 bodies'))).toEqual({
      status: 'failed',
      message: 'This file holds 2 solid bodies. Choose the one to machine.',
      bodies: [body(0, null), body(1)],
    })
    expect(bodyChoiceEvent(job('body_not_found: bodyIndex 4', [named]))).toEqual({
      status: 'failed',
      message: 'This file holds 1 solid body. Choose the one to machine.',
      bodies: [body(1)],
    })
    expect(bodyChoiceEvent(job('Invalid geometry'))).toBeNull()
    expect(bodyChoiceEvent(job('multiple_bodies: none listed', []))).toBeNull()
    expect(bodyChoiceEvent(job(null))).toBeNull()
    expect(
      bodyChoiceEvent({ status: 'running', error: 'multiple_bodies: x', bodies: [named] }),
    ).toBeNull()
  })
})
