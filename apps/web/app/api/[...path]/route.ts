import { NextRequest, NextResponse } from 'next/server'

const WORKER = process.env.WORKER_API_URL ?? 'https://citizen-berlin-worker.openberlinai.workers.dev'

async function proxy(req: NextRequest) {
  const url = new URL(req.url)
  const target = `${WORKER}${url.pathname}${url.search}`

  const headers = new Headers()
  headers.set('Content-Type', req.headers.get('Content-Type') ?? 'application/json')
  const auth = req.headers.get('Authorization')
  if (auth) headers.set('Authorization', auth)

  const res = await fetch(target, {
    method: req.method,
    headers,
    body: req.method !== 'GET' && req.method !== 'HEAD' ? await req.text() : undefined,
  })

  const contentType = res.headers.get('Content-Type') ?? 'application/json'

  // Binary responses (images, etc.) — stream as-is
  if (contentType.startsWith('image/') || contentType.startsWith('audio/') || contentType.startsWith('video/')) {
    return new NextResponse(res.body, {
      status: res.status,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': res.headers.get('Cache-Control') ?? 'public, max-age=86400',
      },
    })
  }

  const body = await res.text()
  return new NextResponse(body, {
    status: res.status,
    headers: { 'Content-Type': contentType },
  })
}

export const GET = proxy
export const POST = proxy
export const PUT = proxy
export const PATCH = proxy
export const DELETE = proxy
