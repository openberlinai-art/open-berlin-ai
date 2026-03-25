import { NextRequest, NextResponse } from 'next/server'

const WORKER = process.env.WORKER_API_URL ?? 'https://citizen-berlin-worker.openberlinai.workers.dev'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const headers: Record<string, string> = {}
  const auth = req.headers.get('Authorization')
  if (auth) headers['Authorization'] = auth

  const res = await fetch(`${WORKER}/api/chat/history/${id}`, { headers })
  const data = await res.text()
  return new NextResponse(data, {
    status: res.status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const headers: Record<string, string> = {}
  const auth = req.headers.get('Authorization')
  if (auth) headers['Authorization'] = auth

  const res = await fetch(`${WORKER}/api/chat/history/${id}`, { method: 'DELETE', headers })
  const data = await res.text()
  return new NextResponse(data, {
    status: res.status,
    headers: { 'Content-Type': 'application/json' },
  })
}
