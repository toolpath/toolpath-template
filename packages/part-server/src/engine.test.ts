import { describe, expect, it } from 'vitest'
import { engineDetail, publicEngineErrorMessage } from './engine.js'

/**
 * A 402 from the Engine reached the browser as "HTTP 402" and nothing else on
 * 2026-08-30 — Payment Required, from an account the person cannot see from
 * here. The Engine's body says which quota or plan; it is passed on.
 */
describe('what the Engine said', () => {
  it('reads a JSON body’s message, detail or error', async () => {
    expect(
      await engineDetail(
        new Response(JSON.stringify({ message: 'Monthly analysis quota reached' })),
      ),
    ).toBe('Monthly analysis quota reached')
    expect(await engineDetail(new Response(JSON.stringify({ detail: 'Plan required' })))).toBe(
      'Plan required',
    )
    expect(await engineDetail(new Response(JSON.stringify({ error: 'billing' })))).toBe('billing')
  })

  it('takes plain text as it is, short, and nothing from nothing', async () => {
    expect(await engineDetail(new Response('Payment Required'))).toBe('Payment Required')
    expect(await engineDetail(new Response('x'.repeat(500)))).toHaveLength(200)
    expect(await engineDetail(new Response(''))).toBeNull()
    expect(await engineDetail(new Response(JSON.stringify({ code: 7 })))).toBeNull()
  })

  it('puts the reason on the public message, and nothing where there is none', () => {
    expect(publicEngineErrorMessage(402, 'Monthly analysis quota reached')).toBe(
      'Toolpath Engine request failed (HTTP 402): Monthly analysis quota reached',
    )
    expect(publicEngineErrorMessage(502)).toBe('Toolpath Engine request failed (HTTP 502).')
  })
})
