import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { fetchListing } from '@/lib/api'
import { ListingPageClient } from './ListingPageClient'

export const revalidate = 300

interface Props {
  params: Promise<{ id: string }>
}

const TYPE_LABELS: Record<string, string> = {
  apartment_rent: 'Apartment for Rent',
  apartment_buy:  'Apartment for Sale',
  item:           'Item for Sale',
  service:        'Service',
}

function formatPrice(priceCents: number | null, priceType: string, currency: string): string {
  if (priceType === 'free') return 'Free'
  if (priceCents == null) return ''
  const amount = (priceCents / 100).toLocaleString('de-DE', { minimumFractionDigits: 0 })
  const suffix = priceType === 'per_month' ? '/mo' : priceType === 'negotiable' ? ' (VB)' : ''
  return `${amount} ${currency}${suffix}`
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  try {
    const listing = await fetchListing(id)
    return {
      title:       `${listing.title} — Citizen.Berlin`,
      description: [TYPE_LABELS[listing.type], listing.borough, listing.address].filter(Boolean).join(' · '),
    }
  } catch {
    return { title: 'Listing — Citizen.Berlin' }
  }
}

export default async function ListingPage({ params }: Props) {
  const { id } = await params
  let listing
  try {
    listing = await fetchListing(id)
  } catch {
    notFound()
  }

  const typeLabel = TYPE_LABELS[listing.type] ?? listing.type
  const price = formatPrice(listing.price_cents, listing.price_type, listing.currency)
  const images: string[] = listing.images ? JSON.parse(listing.images) : []
  const isApartment = listing.type === 'apartment_rent' || listing.type === 'apartment_buy'

  return (
    <main className="min-h-screen bg-white font-sans">
      {/* Nav bar */}
      <div className="border-b-2 border-black px-4 py-3 flex items-center gap-3">
        <Link
          href="/"
          className="text-xs font-bold border-2 border-black px-2 py-1 hover:bg-black hover:text-white transition-colors"
        >
          ← Back to map
        </Link>
        <span className="text-xs text-gray-400">{typeLabel}</span>
        {listing.status !== 'active' && (
          <span className="text-[10px] border border-red-300 px-1.5 py-0.5 text-red-500 uppercase font-bold">
            {listing.status}
          </span>
        )}
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Title + type badge */}
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-2">
            <span
              className="inline-block px-1.5 py-0.5 text-[10px] font-bold text-white uppercase"
              style={{
                backgroundColor:
                  listing.type === 'apartment_rent' ? '#2563eb'
                  : listing.type === 'apartment_buy' ? '#16a34a'
                  : listing.type === 'item' ? '#d97706'
                  : '#7c3aed',
              }}
            >
              {typeLabel}
            </span>
            {listing.category && (
              <span className="inline-block px-1.5 py-0.5 border border-gray-300 text-[10px] text-gray-500">
                {listing.category}
              </span>
            )}
          </div>
          <h1 className="text-2xl font-extrabold leading-tight text-gray-900">
            {listing.title}
          </h1>
        </div>

        {/* Price */}
        {price && (
          <div className="border-2 border-black p-3 mb-4">
            <p className="text-lg font-extrabold text-gray-900">{price}</p>
          </div>
        )}

        {/* Description */}
        {listing.description && (
          <p className="text-sm text-gray-600 leading-relaxed mb-4 whitespace-pre-line">
            {listing.description}
          </p>
        )}

        {/* Apartment details */}
        {isApartment && (listing.rooms || listing.sqm || listing.floor != null) && (
          <div className="border-2 border-black p-3 mb-4 grid grid-cols-3 gap-3">
            {listing.rooms != null && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Rooms</p>
                <p className="text-sm font-bold">{listing.rooms}</p>
              </div>
            )}
            {listing.sqm != null && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Size</p>
                <p className="text-sm font-bold">{listing.sqm} m²</p>
              </div>
            )}
            {listing.floor != null && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Floor</p>
                <p className="text-sm font-bold">{listing.floor}.</p>
              </div>
            )}
          </div>
        )}

        {/* Address + borough */}
        {(listing.address || listing.borough) && (
          <div className="border-2 border-black p-3 mb-4 text-sm space-y-0.5">
            {listing.address && <p className="font-mono text-gray-700">{listing.address}</p>}
            {listing.borough && <p className="text-[10px] text-gray-400">{listing.borough}</p>}
          </div>
        )}

        {/* Seller info */}
        <div className="border-2 border-black p-3 mb-4">
          <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-1">Posted by</p>
          <p className="text-sm font-bold">{listing.seller_name ?? 'Anonymous'}</p>
          <p className="text-[10px] text-gray-400">
            {new Date(listing.created_at).toLocaleDateString('de-DE')}
            {listing.expires_at && ` · Expires ${new Date(listing.expires_at).toLocaleDateString('de-DE')}`}
          </p>
        </div>

        {/* Client-side interactive section */}
        <ListingPageClient
          id={listing.id}
          userId={listing.user_id}
          lat={listing.lat}
          lng={listing.lng}
          title={listing.title}
          contactMethod={listing.contact_method}
          contactInfo={listing.contact_info}
          sellerEmail={listing.seller_email}
          images={images}
          status={listing.status}
        />
      </div>
    </main>
  )
}
