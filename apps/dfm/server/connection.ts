import { hkdfSync } from 'node:crypto'
import { EncryptJWT, jwtDecrypt } from 'jose'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { HTTPException } from 'hono/http-exception'
import type { Context } from 'hono'
import type { AppEnv } from './types'

const CONNECTION_SECONDS = 60 * 60 * 8
const CONNECTION_COOKIE = 'part-viewer-connection'
const ISSUER = 'toolpath-part-viewer'
const AUDIENCE = 'toolpath-part-viewer'

const connectionSecret = process.env.APP_SESSION_SECRET
if (!connectionSecret) {
  throw new Error('APP_SESSION_SECRET must be set.')
}

// JWE `A256GCM` needs a 256-bit key. HKDF turns the deployment secret into that exact key size
// while domain-separating this cookie from any future use of APP_SESSION_SECRET.
const connectionKey = new Uint8Array(
  hkdfSync('sha256', connectionSecret, 'toolpath-part-viewer', 'byok connection cookie', 32),
)

const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  // `Secure` is required in every environment. Browsers make an exception for localhost, so
  // local development keeps working without ever demonstrating an insecure BYOK cookie.
  secure: true,
  path: '/',
}

const clearConnection = (c: Context<AppEnv>): void => {
  deleteCookie(c, CONNECTION_COOKIE, cookieOptions)
}

/** Encrypts the BYOK API key into an eight-hour HttpOnly connection cookie. */
export const setConnection = async (c: Context<AppEnv>, apiKey: string): Promise<void> => {
  const token = await new EncryptJWT({ apiKey })
    .setProtectedHeader({ alg: 'dir', enc: 'A256GCM', typ: 'JWT' })
    .setIssuedAt()
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setExpirationTime(`${CONNECTION_SECONDS}s`)
    .encrypt(connectionKey)
  setCookie(c, CONNECTION_COOKIE, token, { ...cookieOptions, maxAge: CONNECTION_SECONDS })
}

/**
 * Returns the server-only API key for this request. Expired, tampered, or rotated-secret cookies
 * are simply cleared: they are not application errors and never reach React.
 */
export const readApiKey = async (c: Context<AppEnv>): Promise<string | null> => {
  const token = getCookie(c, CONNECTION_COOKIE)
  if (!token) {
    return null
  }

  try {
    const { payload } = await jwtDecrypt(token, connectionKey, {
      issuer: ISSUER,
      audience: AUDIENCE,
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

export { clearConnection }

export const requireApiKey = async (c: Context<AppEnv>): Promise<string> => {
  const apiKey = await readApiKey(c)
  if (!apiKey) {
    throw new HTTPException(401, { message: 'Your API-key connection has expired. Connect again.' })
  }
  return apiKey
}
