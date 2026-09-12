import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { Holder } from '@toolpath/catalog-data'
import { AssemblyPanel } from './assembly-panel'

const holder: Holder = {
  guid: 'one',
  familyId: 'bt30_er_collet_adapters_metric',
  brand: 'Kennametal',
  vendor: 'Kennametal',
  catalogNumber: 'BT30ER11060M',
  materialNumber: '6694846',
  taper: 'BT30',
  contact: 'taper',
  clamping: 'collet',
  gaugeLength: 60,
  colletSeries: 'ER11',
  boreDiameter: null,
  noseDiameter: null,
  noseLength: null,
  bodyDiameter: null,
  bodyLength: null,
  projection: null,
  flangeDiameter: null,
  colletProtrusion: null,
  productLink: null,
  cadModelUrl: null,
  provenance: {},
}

const read = (notice: string | null) =>
  render(
    <AssemblyPanel
      tool={null}
      holder={holder}
      collet={null}
      selected="holder"
      unit="millimeters"
      notice={notice}
    />,
  )

describe('the panel with no cutter in the stack', () => {
  /**
   * **One message, not two** (Paul, 2026-09-11). A holder chosen with no tool
   * asked for the same tool twice — `nothingToConfirm` in a strip at the top
   * and the drawing frame's own "Choose a tool to draw the assembly." under it.
   */
  it("says why the drawing is empty once, in the notice's words", () => {
    read('Pick a tool for this assembly.')

    expect(screen.getByText('Pick a tool for this assembly.')).toBeInTheDocument()
    expect(screen.queryByText('Choose a tool to draw the assembly.')).toBeNull()
  })

  /** With no reason to give — a rack being browsed with no feature — the frame still says what it wants. */
  it("falls back to the frame's own words where there is no notice", () => {
    read(null)

    expect(screen.getByText('Choose a tool to draw the assembly.')).toBeInTheDocument()
  })
})
