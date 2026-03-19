'use client'

import Link from 'next/link'

const WORKER = 'https://citizen-berlin-worker.openberlinai.workers.dev'

const TYPE_BADGES: Record<string, { color: string; label: string }> = {
  apartment_rent: { color: '#2563eb', label: 'Rent' },
  apartment_buy:  { color: '#16a34a', label: 'Buy' },
  item:           { color: '#d97706', label: 'Item' },
  service:        { color: '#7c3aed', label: 'Service' },
}

function formatPrice(priceCents: number | null, priceType: string, currency: string): string {
  if (priceType === 'free') return 'Free'
  if (priceCents == null) return ''
  const amount = (priceCents / 100).toLocaleString('de-DE', { minimumFractionDigits: 0 })
  const suffix = priceType === 'per_month' ? '/mo' : ''
  return `${amount} ${currency}${suffix}`
}

interface ListingItem {
  id:             string
  type:           string
  title:          string
  price_cents:    number | null
  price_type:     string
  currency:       string
  borough:        string | null
  images:         string | null
  lat:            number | null
  lng:            number | null
}

interface Props {
  listings:  ListingItem[]
  loading:   boolean
  onFlyTo?:  (coords: [number, number]) => void
}

export default function ListingsList({ listings, loading, onFlyTo }: Props) {
  if (loading && listings.length === 0) {
    return <div className="flex items-center justify-center h-32 text-sm text-gray-400">Loading…</div>
  }
  if (listings.length === 0) {
    return <div className="flex items-center justify-center h-32 text-sm text-gray-400">No listings found</div>
  }

  return (
    <>
      {listings.map(item => {
        const badge = TYPE_BADGES[item.type] ?? { color: '#6b7280', label: item.type }
        const price = formatPrice(item.price_cents, item.price_type, item.currency)
        const imgs: string[] = item.images ? JSON.parse(item.images) : []
        const thumb = imgs.length > 0 ? `${WORKER}/api/listings/images/${imgs[0]}` : null

        return (
          <div
            key={item.id}
            className="px-4 py-3 border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
            onClick={() => {
              if (item.lat && item.lng && onFlyTo) onFlyTo([item.lng, item.lat])
            }}
          >
            <div className="flex items-start gap-3">
              {/* Thumbnail */}
              {thumb && (
                <div className="w-14 h-14 shrink-0 border border-gray-200 overflow-hidden bg-gray-100">
                  <img src={thumb} alt="" className="w-full h-full object-cover" />
                </div>
              )}

              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-bold text-sm text-gray-900 leading-snug truncate">
                    {item.title}
                  </p>
                  <span
                    className="text-[10px] px-1.5 py-0.5 font-bold text-white shrink-0"
                    style={{ backgroundColor: badge.color }}
                  >
                    {badge.label}
                  </span>
                </div>

                {price && (
                  <p className="text-xs font-semibold text-gray-800 mt-0.5">{price}</p>
                )}
                {item.borough && (
                  <p className="text-[10px] text-gray-400 mt-0.5">{item.borough}</p>
                )}

                <Link
                  href={`/listings/${item.id}`}
                  onClick={e => e.stopPropagation()}
                  className="text-[10px] text-gray-400 hover:text-black hover:underline"
                >
                  Details →
                </Link>
              </div>
            </div>
          </div>
        )
      })}
    </>
  )
}
