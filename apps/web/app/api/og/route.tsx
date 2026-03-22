import { ImageResponse } from 'next/og'
import { NextRequest } from 'next/server'

export const runtime = 'edge'

const WORKER = process.env.WORKER_API_URL ?? 'https://citizen-berlin-worker.openberlinai.workers.dev'

async function fetchItem(type: string, id: string) {
  if (type === 'event') {
    const res = await fetch(`${WORKER}/api/events/${id}`)
    if (!res.ok) return null
    const json = await res.json() as { data: Record<string, unknown> }
    return json.data
  }
  if (type === 'location') {
    const res = await fetch(`${WORKER}/api/locations/${id}`)
    if (!res.ok) return null
    const json = await res.json() as { data: Record<string, unknown> }
    return json.data
  }
  if (type === 'poi') {
    const res = await fetch(`${WORKER}/api/pois/${id}`)
    if (!res.ok) return null
    const json = await res.json() as { data: Record<string, unknown> }
    return json.data
  }
  return null
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const type = searchParams.get('type') ?? 'event'
  const id = searchParams.get('id') ?? ''

  const item = await fetchItem(type, id)

  const title = (item?.title ?? item?.name ?? 'Citizen.Berlin') as string
  const category = (item?.category ?? item?.category_group ?? '') as string
  const dateStart = (item?.date_start ?? '') as string
  const locationName = (item?.location_name ?? item?.address ?? '') as string

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '60px',
          backgroundColor: 'white',
          border: '8px solid black',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {category && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
            }}>
              <span style={{
                padding: '4px 12px',
                border: '3px solid black',
                fontSize: '20px',
                fontWeight: 800,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}>
                {category}
              </span>
              <span style={{
                padding: '4px 12px',
                border: '3px solid black',
                fontSize: '20px',
                fontWeight: 800,
                textTransform: 'uppercase',
                backgroundColor: 'black',
                color: 'white',
              }}>
                {type}
              </span>
            </div>
          )}
          <h1 style={{
            fontSize: title.length > 60 ? '40px' : '52px',
            fontWeight: 900,
            lineHeight: 1.1,
            color: '#111',
            maxWidth: '900px',
          }}>
            {title}
          </h1>
        </div>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {dateStart && (
              <span style={{ fontSize: '22px', color: '#555', fontFamily: 'monospace' }}>
                {dateStart}
              </span>
            )}
            {locationName && (
              <span style={{ fontSize: '20px', color: '#777' }}>
                {locationName}
              </span>
            )}
          </div>
          <span style={{ fontSize: '24px', fontWeight: 900, color: '#111' }}>
            Citizen.Berlin
          </span>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      headers: {
        'Cache-Control': 'public, max-age=86400',
      },
    },
  )
}
