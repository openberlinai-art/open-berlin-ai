import type { Metadata } from 'next'
import { CreateListingClient } from './CreateListingClient'

export const metadata: Metadata = {
  title: 'New Listing — Citizen.Berlin',
}

export default function NewListingPage() {
  return <CreateListingClient />
}
