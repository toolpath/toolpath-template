import { hkdfSync } from 'node:crypto'
import { EncryptJWT, jwtDecrypt } from 'jose'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { HTTPException } from 'hono/http-exception'
import type { Context } from 'hono'
import type { AppEnv } from './types.js'

const CONNECTION_SECONDS = 60 * 60 * 8

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])

/**
 * Whether a request reached this server as plain HTTP on the loopback host —
 * the one case the connection cookie is set without `Secure`.
 *
 * Chrome and Firefox treat `http://localhost` as a secure context and keep a
 * `Secure` cookie there; WebKit does not, so Safari dropped the connection on
 * every local run. Loopback over HTTP never leaves the machine, so it is the
 * only exception: any other host, and any HTTPS, keeps `Secure` — and so does
 * any request under `NODE_ENV=production`, checked where the cookie is set.
 * `apps/dfm/server/connection.ts` carries a one-line twin of this.
 */
export const isPlainLocalhost = (url: string): boolean => {
  const { protocol, hostname } = new URL(url)
  return protocol === 'http:' && LOOPBACK_HOSTS.has(hostname)
}

const cookieOptions = (c: Context<AppEnv>) => ({
  httpOnly: true,
  sameSite: 'lax' as const,
  // Production is always `Secure`, whatever URL the server itself was reached on.
  secure: process.env.NODE_ENV === 'production' || !isPlainLocalhost(c.req.url),
  path: '/',
})

/** The BYOK connection for one application: its cookie, and the key that seals it. */
export interface Connection {
  setConnection: (c: Context<AppEnv>, apiKey: string) => Promise<void>
  readApiKey: (c: Context<AppEnv>) => Promise<string | null>
  requireApiKey: (c: Context<AppEnv>) => Promise<string>
  clearConnection: (c: Context<AppEnv>) => void
}

/**
 * Builds the connection for one application.
 *
 * `appName` names the cookie and domain-separates the derived key, so two
 * applications deployed on one origin cannot read each other's session even
 * though they share `APP_SESSION_SECRET`. It is not decoration: change it and
 * every existing session for that application is invalidated, which is the
 * correct behaviour and worth knowing before renaming an application.
 */
export const createConnection = (appName: string): Connection => {
  const connectionSecret = process.env.APP_SESSION_SECRET
  if (!connectionSecret) {
    throw new Error('APP_SESSION_SECRET must be set.')
  }

  const cookieName = `${appName}-connection`
  const issuer = `toolpath-${appName}`

  // JWE `A256GCM` needs a 256-bit key. HKDF turns the deployment secret into that exact key size
  // while domain-separating this cookie from any future use of APP_SESSION_SECRET.
  const connectionKey = new Uint8Array(
    hkdfSync('sha256', connectionSecret, issuer, 'byok connection cookie', 32),
  )

  const clearConnection = (c: Context<AppEnv>): void => {
    deleteCookie(c, cookieName, cookieOptions(c))
  }

  /** Encrypts the BYOK API key into an eight-hour HttpOnly connection cookie. */
  const setConnection = async (c: Context<AppEnv>, apiKey: string): Promise<void> => {
    const token = await new EncryptJWT({ apiKey })
      .setProtectedHeader({ alg: 'dir', enc: 'A256GCM', typ: 'JWT' })
      .setIssuedAt()
      .setIssuer(issuer)
      .setAudience(issuer)
      .setExpirationTime(`${CONNECTION_SECONDS}s`)
      .encrypt(connectionKey)
    setCookie(c, cookieName, token, { ...cookieOptions(c), maxAge: CONNECTION_SECONDS })
  }

  /**
   * Returns the server-only API key for this request. Expired, tampered, or rotated-secret cookies
   * are simply cleared: they are not application errors and never reach React.
   */
  const readApiKey = async (c: Context<AppEnv>): Promise<string | null> => {
    const token = getCookie(c, cookieName)
    if (!token) {
      return null
    }

    try {
      const { payload } = await jwtDecrypt(token, connectionKey, {
        issuer,
        audience: issuer,
        keyManagementAlgorithms: ['dir'],
        contentEncryptionAlgorithms: ['A256GCM'],
      })
      if (typeof payload.apiKey === 'string' && payload.apiKey) {
        return payload.apiKey
      }
      clearConnection(c)
      return null
    } catch {
      clearConnection(c)
      return null
    }
  }

  const requireApiKey = async (c: Context<AppEnv>): Promise<string> => {
    const apiKey = await readApiKey(c)
    if (!apiKey) {
      throw new HTTPException(401, {
        message: 'Your API-key connection has expired. Connect again.',
      })
    }
    return apiKey
  }

  return { setConnection, readApiKey, requireApiKey, clearConnection }
}
