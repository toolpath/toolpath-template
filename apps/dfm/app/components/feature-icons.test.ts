import { describe, expect, test } from 'vitest'
import { MEASUREMENT_ICONS } from './feature-icons'
import { STRIP_LABELS } from 'shared/measurements'

describe('measurement icons', () => {
  test('draws every measurement the strip can show', () => {
    // The strip is a picture over a number. A key that reaches it without a
    // drawing is a number sitting over nothing, which is the one place a
    // missing icon is unmissable.
    expect(Object.keys(STRIP_LABELS).filter((key) => !MEASUREMENT_ICONS[key])).toEqual([])
  })
})
