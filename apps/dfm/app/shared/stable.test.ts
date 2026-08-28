// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useStable } from './stable'

describe('useStable', () => {
  it('hands back the same object and the same functions across renders', () => {
    const { result, rerender } = renderHook(
      ({ tag }: { tag: string }) => useStable({ choose: () => tag }),
      { initialProps: { tag: 'a' } },
    )

    const first = result.current
    const firstChoose = result.current.choose
    rerender({ tag: 'b' })

    expect(result.current).toBe(first)
    expect(result.current.choose).toBe(firstChoose)
  })

  /*
   * The whole point of the indirection. A stable identity that also froze the
   * closure would be worse than no memoisation: the panel would keep rendering
   * and start acting on state that had moved on.
   */
  it('calls the version from the latest render, not the first', () => {
    const { result, rerender } = renderHook(
      ({ tag }: { tag: string }) => useStable({ choose: () => tag }),
      { initialProps: { tag: 'a' } },
    )

    const choose = result.current.choose
    expect(choose()).toBe('a')

    rerender({ tag: 'b' })
    expect(choose()).toBe('b')
  })

  it('passes arguments and returns what the callback returns', () => {
    const { result } = renderHook(() =>
      useStable({ add: (left: number, right: number) => left + right }),
    )

    expect(result.current.add(2, 3)).toBe(5)
  })

  it('forwards to every callback in the bag', () => {
    const choose = vi.fn()
    const hover = vi.fn()
    const { result } = renderHook(() => useStable({ choose, hover }))

    act(() => {
      result.current.choose('hole-1')
      result.current.hover(['hole-1', 'hole-2'])
    })

    expect(choose).toHaveBeenCalledWith('hole-1')
    expect(hover).toHaveBeenCalledWith(['hole-1', 'hole-2'])
  })
})
