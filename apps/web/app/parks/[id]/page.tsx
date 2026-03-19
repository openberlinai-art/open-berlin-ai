import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import GreenspaceDetail from '@/components/GreenspaceDetail'

export const revalidate = 86400

const WORKER = 'https://citizen-berlin-worker.openberlinai.workers.dev'

interface Props {
  params: Promise<{ id: string }>
}

async function fetchPark(id: string) {
  const res = await fetch(`${WORKER}/api/geodata/parks/${encodeURIComponent(id)}`, {
    next: { revalidate: 3600 },
  })
  if (!res.ok) return null
  return res.json() as Promise<{
    geometry: { type: 'Point'; coordinates: [number, number] }
    properties: Record<string, string | null>
  }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const feature = await fetchPark(id)
  if (!feature) return { title: 'Park — Citizen.Berlin' }
  const p = feature.properties
  const name = p.namenr ?? p.name ?? 'Park'
  return {
    title:       `${name} — Citizen.Berlin`,
    description: [p.objartname, p.ortstlname, p.bezirkname].filter(Boolean).join(' · '),
  }
}

export default async function ParkPage({ params }: Props) {
  const { id } = await params
  const feature = await fetchPark(id)
  if (!feature) notFound()

  return <GreenspaceDetail feature={feature} type="park" />
}
