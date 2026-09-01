import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { applyTheme, readTheme, useTheme, THEME_STORAGE_KEY } from './use-theme'

const store = (held: Record<string, string> = {}) => ({
  getItem: (key: string) => held[key] ?? null,
})

describe('the theme this browser is in', () => {
  /** Dark is what the application was drawn for, so it is what nothing means. */
  it('is dark unless light was asked for', () => {
    expect(readTheme(store())).toBe('dark')
    expect(readTheme(null)).toBe('dark')
    expect(readTheme(store({ [THEME_STORAGE_KEY]: 'nonsense' }))).toBe('dark')
    expect(readTheme(store({ [THEME_STORAGE_KEY]: 'light' }))).toBe('light')
  })

  /**
   * One class is the whole switch: `@toolpath/ui` keys its `dark:` variant off
   * it, and `styles.css` hangs the flipped zinc ramp on it.
   */
  it('is put on the document as one class', () => {
    const root = document.createElement('html')

    applyTheme(root, 'light')
    expect(root.classList.contains('dark')).toBe(false)
    expect(root.style.colorScheme).toBe('light')

    applyTheme(root, 'dark')
    expect(root.classList.contains('dark')).toBe(true)
    expect(root.style.colorScheme).toBe('dark')
  })
})

/**
 * **One theme, read by everybody** (Paul, 2026-09-01: the 2D drawing kept its
 * dark sheet after the header switched to light). Each `useTheme` held its own
 * `useState`, so the switch updated the component that owned the switch. It is
 * invisible while every colour is a `zinc` step the ramp flips underneath, and
 * plain the moment something states a colour of its own.
 */
describe('every reader sees the same theme', () => {
  const Reader = () => {
    const [theme] = useTheme()
    return <span data-testid="reader">{theme}</span>
  }

  const Switch = () => {
    const [theme, choose] = useTheme()
    return (
      <button type="button" onClick={() => choose(theme === 'dark' ? 'light' : 'dark')}>
        flip
      </button>
    )
  }

  it('updates a component that did not own the switch', () => {
    render(
      <>
        <Switch />
        <Reader />
      </>,
    )
    const reader = screen.getByTestId('reader')
    const first = reader.textContent

    fireEvent.click(screen.getByRole('button', { name: 'flip' }))

    expect(reader.textContent).not.toBe(first)
    expect(document.documentElement.classList.contains('dark')).toBe(reader.textContent === 'dark')

    fireEvent.click(screen.getByRole('button', { name: 'flip' }))

    expect(reader.textContent).toBe(first)
  })
})
