import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SavedStrip, type SavedEntry } from './saved-strip'

const entries: Array<SavedEntry> = [
  { featureTag: 'pocket-1', feature: 'Pocket', assembly: 'PG 6 × 50 + TDMX0600', toolGuid: 't1' },
  { featureTag: '*', feature: 'the part', assembly: 'PG 10 × 62 + TDMX1000', toolGuid: 't2' },
]

describe('the saved strip', () => {
  it('is a count when folded, and the chips when open', () => {
    const { rerender } = render(
      <SavedStrip
        entries={entries}
        open={false}
        onOpen={vi.fn()}
        picked={null}
        onPick={vi.fn()}
        onRemove={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: /Saved assemblies · 2/ })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
    expect(screen.queryByText('PG 6 × 50 + TDMX0600')).not.toBeInTheDocument()

    rerender(
      <SavedStrip
        entries={entries}
        open
        onOpen={vi.fn()}
        picked="pocket-1"
        onPick={vi.fn()}
        onRemove={vi.fn()}
      />,
    )
    expect(screen.getByText('PG 6 × 50 + TDMX0600')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Pocket/ })).toHaveAttribute('aria-pressed', 'true')
  })

  /** Paul's rule: opened by a save, folded by any press that is not inside it. */
  it('folds on a press anywhere else, and not on one inside', () => {
    const onOpen = vi.fn()
    render(
      <div>
        <button type="button">elsewhere</button>
        <SavedStrip
          entries={entries}
          open
          onOpen={onOpen}
          picked={null}
          onPick={vi.fn()}
          onRemove={vi.fn()}
        />
      </div>,
    )
    fireEvent.pointerDown(screen.getByText('PG 6 × 50 + TDMX0600'))
    expect(onOpen).not.toHaveBeenCalled()
    fireEvent.pointerDown(screen.getByText('elsewhere'))
    expect(onOpen).toHaveBeenCalledWith(false)
  })

  it('hands back the entry picked or forgotten', () => {
    const onPick = vi.fn()
    const onRemove = vi.fn()
    render(
      <SavedStrip
        entries={entries}
        open
        onOpen={vi.fn()}
        picked={null}
        onPick={onPick}
        onRemove={onRemove}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /^Pocket/ }))
    expect(onPick).toHaveBeenCalledWith(entries[0])
    fireEvent.click(screen.getByRole('button', { name: 'Forget the assembly saved for the part' }))
    expect(onRemove).toHaveBeenCalledWith(entries[1])
  })

  it('is nothing at all with nothing saved', () => {
    const { container } = render(
      <SavedStrip
        entries={[]}
        open
        onOpen={vi.fn()}
        picked={null}
        onPick={vi.fn()}
        onRemove={vi.fn()}
      />,
    )
    expect(container).toBeEmptyDOMElement()
  })
})
