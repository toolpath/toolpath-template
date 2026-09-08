import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { AssemblyTreePanel } from './assembly-tree-panel'
import { defaultAssemblies, setSlot, type TreeAssembly } from 'shared/assembly-tree'

/** One stack with a holder in it, so the slots that hold something have one. */
const held = setSlot(defaultAssemblies(false), 'assembly-1', 'holder', 'holder-a')

const draw = (
  assemblies: ReadonlyArray<TreeAssembly>,
  over: Partial<Parameters<typeof AssemblyTreePanel>[0]> = {},
) =>
  render(
    <AssemblyTreePanel
      assemblies={assemblies}
      selected={{ assemblyId: assemblies[0]?.id ?? 'assembly-1', slot: 'tool' }}
      onSelect={() => undefined}
      labelFor={(assembly, slot) =>
        slot === 'holder' && assembly.holderGuid !== null ? 'BT30ER16060M' : null
      }
      orderedFor={() => null}
      onClear={() => undefined}
      actionsFor={() => []}
      onAdd={() => undefined}
      onRemove={() => undefined}
      title="Cuts the pocket"
      {...over}
    />,
  )

describe('the tree on screen', () => {
  it('draws the three slots of an ordinary feature', () => {
    draw(defaultAssemblies(false))

    expect(screen.getByRole('button', { name: /^TOOL for/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^HOLDER for/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^COLLET for/ })).toBeInTheDocument()
  })

  /** The one feature that needs two stacks before it is a hole at all. */
  it('draws a threaded hole as a tap and a drill', () => {
    draw(defaultAssemblies(true))

    expect(screen.getByRole('button', { name: /^TAP for/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^DRILL for/ })).toBeInTheDocument()
  })

  it('shows what a slot holds, and an em dash where nothing is chosen', () => {
    draw(held)

    expect(screen.getByRole('button', { name: /^HOLDER for/ })).toHaveTextContent('BT30ER16060M')
    expect(screen.getByRole('button', { name: /^TOOL for/ })).toHaveTextContent('—')
  })

  it('reports the slot that was pressed', () => {
    const onSelect = vi.fn()
    draw(defaultAssemblies(false), { onSelect })

    fireEvent.click(screen.getByRole('button', { name: /^COLLET for/ }))

    expect(onSelect).toHaveBeenCalledWith({ assemblyId: 'assembly-1', slot: 'collet' })
  })

  /** A slot with nothing in it has nothing to clear, so it offers no way to. */
  it('offers a way out of a slot only once it holds something', () => {
    const onClear = vi.fn()
    draw(held, { onClear })

    expect(screen.queryByRole('button', { name: 'Clear the tool' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Clear the holder' }))

    expect(onClear).toHaveBeenCalledWith('assembly-1', 'holder')
  })

  /**
   * **One button per assembly, and its label is the change** (Paul, 2026-09-07:
   * "I should just have an 'add to order list' button (or update, context
   * aware), at the top level of each tool assembly"). What is offered is
   * `shared/assembly-actions`; what this draws is one press per stack, with
   * whatever else it moves said under it.
   */
  it('draws what a stack offers, under the stack it is about', () => {
    const onClick = vi.fn()
    draw(held, {
      actionsFor: (assembly) =>
        assembly.id === 'assembly-1'
          ? [{ key: 'add', label: 'Add to order list', onClick, note: 'The collet comes off.' }]
          : [],
    })

    fireEvent.click(screen.getByRole('button', { name: 'Add to order list' }))

    expect(onClick).toHaveBeenCalled()
    expect(screen.getByText('The collet comes off.')).toBeInTheDocument()
  })

  it('offers nothing where the stack offers nothing', () => {
    draw(held)

    expect(screen.queryByRole('button', { name: /order list/ })).not.toBeInTheDocument()
  })

  /**
   * **A change shows on the row it is a change to** (Paul, 2026-09-07: "when I
   * make changes, they should show in the respective component rows (like tool
   * x -> tool y)"). The row said only what the slot holds now, so which of the
   * three had moved was a thing to work out from the button's sentence.
   */
  it('shows what the order list holds beside what the slot holds now', () => {
    draw(held, { orderedFor: (_assembly, slot) => (slot === 'holder' ? 'BT30SF0600M' : null) })

    const row = screen.getByRole('button', { name: /^HOLDER for/ })
    expect(row).toHaveTextContent('BT30SF0600M')
    expect(row).toHaveTextContent('BT30ER16060M')
    // And the slots that did not move say nothing about the order list.
    expect(screen.getByRole('button', { name: /^TOOL for/ })).toHaveTextContent('—')
  })

  it('asks for another stack', () => {
    const onAdd = vi.fn()
    draw(defaultAssemblies(false), { onAdd })

    fireEvent.click(screen.getByRole('button', { name: 'Add assembly' }))

    expect(onAdd).toHaveBeenCalled()
  })

  /**
   * A feature with one untouched stack has nothing to remove — the button would
   * do nothing anybody could see, which is the shape `removeAssembly` refuses.
   */
  it('offers Remove only where there is something to remove', () => {
    const { unmount } = draw(defaultAssemblies(false))
    expect(screen.queryByRole('button', { name: /^Remove assembly/ })).not.toBeInTheDocument()
    unmount()

    draw(setSlot(defaultAssemblies(false), 'assembly-1', 'tool', 'tool-a'))
    expect(screen.getByRole('button', { name: 'Remove assembly 1' })).toBeInTheDocument()
  })
})
