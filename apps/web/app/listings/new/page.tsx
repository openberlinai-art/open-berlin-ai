import type { Metadata } from 'next'
import { CreateListingClient } from './CreateListingClient'

export const metadata: Metadata = {
  title: 'New Listing — KulturPulse',
}

export default function NewListingPage() {
  return <CreateListingClient />
}
