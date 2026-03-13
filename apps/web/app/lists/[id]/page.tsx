'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ExternalLink, MapPin, Calendar } from 'lucide-react'

const WORKER = 'https://kulturpulse-worker.openberlinai.workers.dev'

interface ListRow {
  id:          string
  name:        string
  description: string | null
  is_public:   number
  created_at:  string
}

interface ListItem {
  id:        string
  list_id:   string
  item_type: 'event' | 'location'
  item_id:   string
  notes:     string | null
  added_at:  string
}

export default function PublicListPage() {
  const { id } = useParams<{ id: string }>()
  const [list,    setList]    = useState<ListRow | null>(null)
  const [items,   setItems]   = useState<ListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    fetch(`${WORKER}/api/lists/${id}/public`)
      .then(async r => {
        if (!r.ok) {
          const json = await r.json().catch(() => ({})) as { error?: string }
          throw new Error(json.error ?? `Error ${r.status}`)
        }
        return r.json() as Promise<{ data: { list: ListRow; items: ListItem[] } }>
      })
      .then(({ data }) => {
        setList(data.list)
        setItems(data.items)
      })
      .catch(e => setError((e as Error).message))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) {
    return (
      <main className="min-h-screen bg-white font-sans flex items-center justify-center">
        <p className="text-xs text-gray-400">Loading…</p>
      </main>
    )
  }

  if (error || !list) {
    return (
      <main className="min-h-screen bg-white font-sans">
        <div className="border-b-2 border-black px-4 py-3">
          <Link href="/" className="text-xs font-bold border-2 border-black px-2 py-1 hover:bg-black hover:text-white transition-colors">
            ← Back to map
          </Link>
        </div>
        <div className="max-w-xl mx-auto px-4 py-16 text-center">
          <p className="text-sm font-bold text-gray-900 mb-1">{error ?? 'List not found'}</p>
          <p className="text-xs text-gray-400">This list may be private or no longer exist.</p>
        </div>
      </main>
    )
  }

  const events    = items.filter(i => i.item_type === 'event')
  const locations = items.filter(i => i.item_type === 'location')

  return (
    <main className="min-h-screen bg-white font-sans">
      {/* Nav */}
      <div className="border-b-2 border-black px-4 py-3 flex items-center gap-3">
        <Link href="/" className="text-xs font-bold border-2 border-black px-2 py-1 hover:bg-black hover:text-white transition-colors">
          ← Back to map
        </Link>
        <span className="text-xs text-gray-400">Shared list</span>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-extrabold leading-tight text-gray-900">{list.name}</h1>
          {list.description && (
            <p className="text-sm text-gray-500 mt-1">{list.description}</p>
          )}
          <p className="text-[10px] text-gray-400 mt-2">
            {items.length} item{items.length !== 1 ? 's' : ''}
          </p>
        </div>

        {items.length === 0 && (
          <p className="text-sm text-gray-400">This list is empty.</p>
        )}

        {/* Locations */}
        {locations.length > 0 && (
          <section className="mb-8">
            <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-3 flex items-center gap-1">
              <MapPin size={10} /> Venues ({locations.length})
            </p>
            <div className="space-y-2">
              {locations.map(item => (
                <div key={item.id} className="border-2 border-black px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <Link
                      href={`/locations/${item.item_id}`}
                      className="text-sm font-bold text-gray-900 hover:underline font-mono"
                    >
                      {item.item_id}
                    </Link>
                    <Link
                      href={`/locations/${item.item_id}`}
                      className="shrink-0 text-[10px] border border-black px-1.5 py-0.5 hover:bg-black hover:text-white flex items-center gap-0.5"
                    >
                      View <ExternalLink size={8} />
                    </Link>
                  </div>
                  {item.notes && (
                    <p className="text-xs text-gray-500 italic mt-0.5">{item.notes}</p>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Events */}
        {events.length > 0 && (
          <section>
            <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-3 flex items-center gap-1">
              <Calendar size={10} /> Events ({events.length})
            </p>
            <div className="space-y-2">
              {events.map(item => (
                <div key={item.id} className="border-2 border-black px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-bold text-gray-900 font-mono">{item.item_id}</p>
                    <Link
                      href={`/?event=${item.item_id}`}
                      className="shrink-0 text-[10px] border border-black px-1.5 py-0.5 hover:bg-black hover:text-white flex items-center gap-0.5"
                    >
                      View <ExternalLink size={8} />
                    </Link>
                  </div>
                  {item.notes && (
                    <p className="text-xs text-gray-500 italic mt-0.5">{item.notes}</p>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  )
}
