import { NextRequest, NextResponse } from 'next/server'

const WORKER = process.env.WORKER_API_URL ?? 'https://citizen-berlin-worker.openberlinai.workers.dev'

export async function POST(req: NextRequest) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const auth = req.headers.get('Authorization')
  if (auth) headers['Authorization'] = auth

  const res = await fetch(`${WORKER}/api/chat/save`, {
    method: 'POST',
    headers,
    body: await req.text(),
  })
  const data = await res.text()
  return new NextResponse(data, {
    status: res.status,
    headers: { 'Content-Type': 'application/json' },
  })
}
