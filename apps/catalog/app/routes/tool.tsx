import { useState } from 'react'
import { Link, useParams } from 'react-router'
import type { Margins } from '@toolpath/catalog-data'
import { knobValue } from 'shared/rules'
import { AppHeader } from 'components/app-header'
import { AssemblyPicker } from 'components/assembly-picker'
import { DrawingCard } from 'components/drawing-card'
import { useBuildSelection } from 'shared/use-build-selection'
import { ToolSheet } from 'components/tool-sheet'
import { allTools, getTool } from 'shared/catalog'
import { useUnit } from 'shared/use-unit'

/**
 * One tool, with every dimension the vendor states spelled out.
 *
 * The vendor's `DC`/`LCF`/`RE` codes are unreadable without the dictionary, so
 * every row carries its meaning and where the value came from. A value this
 * pipeline derived or assumed is marked as such: the whole argument for showing
 * vendor data is that a shop can check it.
 */
const Tool = () => {
  const { guid } = useParams()
  const [unit, setUnit] = useUnit()
  const tool = guid ? getTool(guid) : null
  // An assembly *is* this page, so its selection lives in the URL: a link to
  // "this tool in that chuck at this stickout" is the point.
  const [selection, update] = useBuildSelection({})
  // The room to keep between the stack and a part, for the drawing's sake;
  // there is no feature here, so it only seeds what the part page reads.
  const [margins, setMargins] = useState<Margins>(() => ({
    radial: knobValue('radial holder clearance') ?? 0,
    axial: knobValue('axial holder clearance') ?? 0,
  }))

  if (!tool) {
    return (
      <main className="min-h-screen">
        <AppHeader unit={unit} onUnit={setUnit} toolCount={allTools.length} />
        <div className="p-6">
          <p className="text-sm text-zinc-400">
            No tool in this catalog has that identifier. It may have been ingested from a dataset
            this build does not contain.
          </p>
          <Link to="/catalog" className="text-sm text-zinc-200 underline-offset-2 hover:underline">
            Back to the catalog
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen">
      <AppHeader unit={unit} onUnit={setUnit} toolCount={allTools.length} />

      <div className="flex flex-col gap-4 p-6">
        <Link to="/catalog" className="text-sm text-zinc-400 underline-offset-2 hover:underline">
          ← Catalog
        </Link>
        <ToolSheet tool={tool} unit={unit} />
        <AssemblyPicker tool={tool} unit={unit} selection={selection} onChange={update} />
        <div className="h-96">
          <DrawingCard
            tool={tool}
            unit={unit}
            selection={selection}
            onChange={update}
            margins={margins}
            onMargins={setMargins}
          />
        </div>
      </div>
    </main>
  )
}

export default Tool
