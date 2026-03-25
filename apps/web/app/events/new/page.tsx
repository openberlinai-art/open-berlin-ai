import type { Metadata } from 'next'
import { CreateCommunityEventClient } from './CreateCommunityEventClient'

export const metadata: Metadata = {
  title: 'Submit Event — Citizen.Berlin',
  description: 'Submit a community event to Citizen.Berlin',
}

export default function NewEventPage() {
  return <CreateCommunityEventClient />
}
