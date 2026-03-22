import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    const workerUrl = process.env.WORKER_API_URL ?? 'https://citizen-berlin-worker.openberlinai.workers.dev'
    const res = await fetch(`${workerUrl}/api/chat`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
      signal:  AbortSignal.timeout(30_000),
    })

    // Stream-through SSE responses
    const contentType = res.headers.get('Content-Type') ?? ''
    if (contentType.includes('text/event-stream') && res.body) {
      return new Response(res.body, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      })
    }

    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
