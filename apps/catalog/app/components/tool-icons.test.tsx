import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { TOOL_FORMS } from '@toolpath/catalog-data'
import { ToolTypeIcon, formLabel, hasToolTypeIcon } from './tool-icons'

describe('a drawing for every tool the library names', () => {
  it('draws each type in the list', () => {
    for (const type of TOOL_FORMS) {
      expect(hasToolTypeIcon(type.value), type.value).toBe(true)
    }
  })

  /**
   * The catalog's ingested tools say `endmill` and `tap`; a Fusion library says
   * `flat end mill` and `tap right hand`. The same tool under two names must
   * not be two drawings.
   */
  it('finds a drawing through spelling, case and separators', () => {
    for (const name of ['endmill', 'End Mill', 'bull_nose-end mill', 'TAP', 'Center Drill']) {
      expect(hasToolTypeIcon(name), name).toBe(true)
    }
  })

  /** A name nobody has drawn still gets a tool rather than a blank. */
  it('falls back rather than drawing nothing', () => {
    const { container } = render(<ToolTypeIcon toolType="plasma torch" />)
    expect(container.querySelector('svg')).not.toBeNull()
  })

  /**
   * The flutes are part of the drawing, not a second icon beside it. A cutter
   * without them is a rectangle, and a rectangle is not a tool.
   */
  it('puts flutes on the cutters that have them', () => {
    for (const type of ['flat end mill', 'drill', 'tap right hand']) {
      const { container } = render(<ToolTypeIcon toolType={type} />)
      expect(container.querySelectorAll('path').length, type).toBeGreaterThan(1)
    }
  })

  /** Which way the thread leans is the whole of left hand against right hand. */
  it('leans a left-hand tap the other way from a right-hand one', () => {
    const right = render(<ToolTypeIcon toolType="tap right hand" />).container.innerHTML
    const left = render(<ToolTypeIcon toolType="tap left hand" />).container.innerHTML
    expect(left).not.toBe(right)
  })
})

describe('what a tool is called', () => {
  /**
   * A shank narrower than the cut is the first thing a shop wants to know, and
   * since 2026-09-08 that is the whole of the rule: `SFDM < DC`, Paul's, rather
   * than the package's reading of a neck behind the flutes.
   */
  it('leads with the shank where it is thinner than the cut', () => {
    expect(
      formLabel({
        form: 'bull nose end mill',
        geometry: { DC: 12, LCF: 20, SFDM: 10 },
      }),
    ).toBe('Reduced shank bull nose end mill')
  })

  /**
   * A neck behind a full-width shank is a word of its own since 2026-09-09 —
   * not `Reduced shank`, which is about the shank, and not silence either.
   */
  it('says the neck of a tool whose shank is full width', () => {
    expect(
      formLabel({
        form: 'bull nose end mill',
        geometry: { DC: 6, LCF: 12, SFDM: 6, 'shoulder-diameter': 5.4, 'shoulder-length': 40 },
      }),
    ).toBe('Necked bull nose end mill')
  })

  /**
   * A slot mill is a disc of teeth on a neck — there is no full-shank one to
   * tell it apart from, so the words say nothing (Paul, 2026-09-01).
   */
  it('says nothing about the shank of a tool that is always necked', () => {
    expect(
      formLabel({
        form: 'slot mill',
        geometry: { DC: 22.2, LCF: 1.6, SFDM: 12.7 },
      }),
    ).toBe('Slot mill')
    // Nor about the neck (Paul, 2026-09-09: "we just shouldn't touch any of
    // the slot mills"), which is the same rule read literally.
    expect(
      formLabel({
        form: 'slot mill',
        geometry: {
          DC: 22.2,
          LCF: 1.6,
          SFDM: 12.7,
          'shoulder-diameter': 11,
          'shoulder-length': 30,
        },
      }),
    ).toBe('Slot mill')
  })

  /**
   * A tap's shank is sized to the tapping chuck rather than to the thread it
   * cuts, so it is under the major diameter on 59% of the taps in the catalog
   * (Paul, 2026-09-08: "taps should not show reduced shank").
   */
  it('says nothing about the shank of a tap', () => {
    expect(
      formLabel({ form: 'tap right hand', geometry: { DC: 9.525, LCF: 20, SFDM: 7.938 } }),
    ).toBe('Tap right hand')
  })

  it('names a tool with a full shank by its form alone', () => {
    expect(formLabel({ form: 'flat end mill', geometry: { DC: 6, LCF: 12, SFDM: 6 } })).toBe(
      'Flat end mill',
    )
  })
})
