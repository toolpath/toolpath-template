import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { PROFILES_VERSION, profileFor } from './profiles.js'
import type { Catalog } from './types.js'
import type { Profiles } from './profiles.js'

const read = (name: string): string =>
  readFileSync(fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url)), 'utf8')

const committed = JSON.parse(read('sample-profiles.json')) as Profiles
const catalog = JSON.parse(read('sample-catalog.json')) as Catalog

describe('the committed sample profiles', () => {
  it('is the shape this package reads today', () => {
    expect(committed.profilesVersion).toBe(PROFILES_VERSION)
    expect(committed.unit).toBe('millimeters')
  })

  it('is what the generator writes', () => {
    const script = fileURLToPath(new URL('../scripts/build-sample-profiles.mjs', import.meta.url))
    const before = read('sample-profiles.json')

    execFileSync(process.execPath, [script], { stdio: 'pipe' })

    expect(read('sample-profiles.json')).toBe(before)
  })

  /**
   * The failure this file exists to catch. A profile keyed to a guid no catalog
   * holds is not a broken drawing — it is no drawing at all, and it looks
   * exactly like a holder nobody has measured yet.
   */
  it('measures holders the sample catalog actually holds', () => {
    const guids = new Set(catalog.holders.map((holder) => holder.guid))

    for (const profile of Object.values(committed.holders)) {
      expect(guids).toContain(profile.guid)
    }
    for (const holder of catalog.holders) {
      const profile = profileFor(committed, holder.guid)
      expect(profile).not.toBeNull()
      expect(profile?.catalogNumber).toBe(holder.catalogNumber)
    }
  })

  /**
   * Two states, because a UI that renders only the complete one draws a holder
   * whose model omits its collet nut as a shorter holder.
   */
  it('carries a complete profile and one the vendor model falls short of', () => {
    const complete = Object.values(committed.holders).filter((profile) => profile.complete)
    const short = Object.values(committed.holders).filter((profile) => !profile.complete)

    expect(complete.length).toBeGreaterThan(0)
    expect(short.length).toBeGreaterThan(0)
    expect(short[0]?.shortfallMm).toBeGreaterThan(0)
    expect(complete[0]?.shortfallMm).toBeNull()
  })

  /**
   * `z` ascends but does not strictly increase: a step face is two vertices at
   * one `z`, and a consumer that assumes otherwise shaves material off the
   * envelope.
   */
  it('keeps z non-decreasing and steps as coincident vertices', () => {
    for (const profile of Object.values(committed.holders)) {
      expect(profile.points.length).toBeGreaterThan(2)
      for (let index = 1; index < profile.points.length; index += 1) {
        expect(profile.points[index]![0]).toBeGreaterThanOrEqual(profile.points[index - 1]![0])
      }
      expect(
        profile.points.some(([z], index) => index > 0 && z === profile.points[index - 1]![0]),
      ).toBe(true)
    }
  })
})
