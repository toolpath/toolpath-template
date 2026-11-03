import { describe, expect, test } from 'vitest'
import { isPlainLocalhost } from './connection.js'

describe('where the connection cookie may go without Secure', () => {
  test('only plain HTTP on the loopback host', () => {
    expect(isPlainLocalhost('http://localhost:5174/api/session')).toBe(true)
    expect(isPlainLocalhost('http://127.0.0.1:4173/api/session')).toBe(true)
    expect(isPlainLocalhost('http://[::1]:5173/api/session')).toBe(true)
  })

  test('never over HTTPS, nor on any other host', () => {
    expect(isPlainLocalhost('https://localhost:5174/api/session')).toBe(false)
    expect(isPlainLocalhost('http://example.com/api/session')).toBe(false)
    expect(isPlainLocalhost('http://192.168.1.20:5174/api/session')).toBe(false)
    expect(isPlainLocalhost('http://localhost.example.com/api/session')).toBe(false)
    expect(isPlainLocalhost('https://catalog.example.com/api/session')).toBe(false)
  })
})
