import { NextRequest, NextResponse } from 'next/server'

const WORKER = process.env.WORKER_API_URL ?? 'https://citizen-berlin-worker.openberlinai.workers.dev'

export async function GET(req: NextRequest) {
  const headers: Record<string, string> = {}
  const auth = req.headers.get('Authorization')
  if (auth) headers['Authorization'] = auth

  const res = await fetch(`${WORKER}/api/chat/history`, { headers })
  const data = await res.text()
  return new NextResponse(data, {
    status: res.status,
    headers: { 'Content-Type': 'application/json' },
  })
}
