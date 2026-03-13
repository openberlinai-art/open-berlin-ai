// Magic-link auth + JWT session utilities (WebCrypto — Cloudflare Workers compatible)

import type { D1Database } from '@cloudflare/workers-types'
import type { Env } from './types'

// ─── JWT ──────────────────────────────────────────────────────────────────────

export interface JWTPayload {
  sub:   string  // user id
  email: string
  exp:   number  // unix seconds
}

async function importKey(secret: string): Promise<CryptoKey> {
  const enc = new TextEncoder()
  return crypto.subtle.importKey(
    'raw', enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign', 'verify'],
  )
}

function b64url(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function b64urlDecode(s: string): Uint8Array {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=')
  const bin = atob(padded)
  return Uint8Array.from(bin, c => c.charCodeAt(0))
}

export async function signJWT(payload: JWTPayload, secret: string): Promise<string> {
  const header  = b64url(new TextEncoder().encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })))
  const body    = b64url(new TextEncoder().encode(JSON.stringify(payload)))
  const signing = `${header}.${body}`
  const key     = await importKey(secret)
  const sig     = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signing))
  return `${signing}.${b64url(sig)}`
}

export async function verifyJWT(token: string, secret: string): Promise<JWTPayload | null> {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const [header, body, sig] = parts
    const key = await importKey(secret)
    const valid = await crypto.subtle.verify(
      'HMAC', key,
      b64urlDecode(sig),
      new TextEncoder().encode(`${header}.${body}`),
    )
    if (!valid) return null
    const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(body))) as JWTPayload
    if (payload.exp < Math.floor(Date.now() / 1000)) return null
    return payload
  } catch {
    return null
  }
}

// ─── Magic link ───────────────────────────────────────────────────────────────

// Returns dev_link if RESEND_API_KEY is not configured (for local dev / staging)
export async function sendMagicLink(email: string, env: Env): Promise<{ dev_link?: string }> {
  const token     = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '')
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString()

  await env.DB.prepare(
    `INSERT INTO auth_tokens (token, email, expires_at) VALUES (?, ?, ?)
     ON CONFLICT(token) DO NOTHING`
  ).bind(token, email, expiresAt).run()

  const frontendUrl = env.FRONTEND_URL || 'http://localhost:3002'
  const link = `${frontendUrl}/verify?token=${token}`

  // Dev mode: no email configured — return link directly
  if (!env.BREVO_API_KEY) {
    return { dev_link: link }
  }

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method:  'POST',
    headers: {
      'api-key':      env.BREVO_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sender:      { name: 'KulturPulse', email: env.BREVO_SENDER_EMAIL },
      to:          [{ email }],
      subject:     'Your KulturPulse sign-in link',
      htmlContent: `
        <p>Click the link below to sign in to KulturPulse. It expires in 15 minutes.</p>
        <p><a href="${link}" style="font-weight:bold">${link}</a></p>
        <p style="color:#9ca3af;font-size:12px">If you didn't request this, you can ignore this email.</p>
      `,
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Brevo error ${res.status}: ${text}`)
  }
  return {}
}

export async function verifyMagicToken(
  token: string,
  db: D1Database,
): Promise<string | null> {
  const row = await db
    .prepare(`SELECT email, expires_at FROM auth_tokens WHERE token = ?`)
    .bind(token)
    .first<{ email: string; expires_at: string }>()

  if (!row) return null
  if (new Date(row.expires_at) < new Date()) {
    await db.prepare(`DELETE FROM auth_tokens WHERE token = ?`).bind(token).run()
    return null
  }

  // Consume token (one-time use)
  await db.prepare(`DELETE FROM auth_tokens WHERE token = ?`).bind(token).run()
  return row.email
}

// ─── User upsert ──────────────────────────────────────────────────────────────

export interface UserRow {
  id:           string
  email:        string
  display_name: string | null
}

export async function getOrCreateUser(email: string, db: D1Database): Promise<UserRow> {
  const existing = await db
    .prepare(`SELECT id, email, display_name FROM users WHERE email = ?`)
    .bind(email)
    .first<UserRow>()

  if (existing) return existing

  const id = crypto.randomUUID()
  await db
    .prepare(`INSERT INTO users (id, email) VALUES (?, ?)`)
    .bind(id, email)
    .run()

  return { id, email, display_name: null }
}

// ─── Auth middleware helper ───────────────────────────────────────────────────

export async function getUserFromHeader(
  authHeader: string | undefined,
  secret: string,
): Promise<JWTPayload | null> {
  if (!authHeader?.startsWith('Bearer ')) return null
  return verifyJWT(authHeader.slice(7), secret)
}
