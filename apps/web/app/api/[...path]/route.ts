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

  const body = await res.text()
  return new NextResponse(body, {
    status: res.status,
    headers: { 'Content-Type': res.headers.get('Content-Type') ?? 'application/json' },
  })
}

export const GET = proxy
export const POST = proxy
export const PUT = proxy
export const PATCH = proxy
export const DELETE = proxy
