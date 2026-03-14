'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ExternalLink, MapPin, Calendar, BookCopy, Check } from 'lucide-react'
import { UserProvider, useUser } from '@/providers/UserProvider'
import AddToListButton from '@/components/AddToListButton'

const WORKER = process.env.NEXT_PUBLIC_API_URL ?? 'https://kulturpulse-worker.openberlinai.workers.dev'

interface ListRow {
  id:          string
  name:        string
  description: string | null
  is_public:   number
  created_at:  string
}

interface EnrichedItem {
  id:        string
  list_id:   string
  item_type: 'event' | 'location'
  item_id:   string
  notes:     string | null
  added_at:  string
  title:     string | null
  subtitle:  string | null
}

function PublicListContent() {
  const { id } = useParams<{ id: string }>()
  const { user, token } = useUser()
  const [list,     setList]     = useState<ListRow | null>(null)
  const [items,    setItems]    = useState<EnrichedItem[]>([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState<string | null>(null)
  const [copying,  setCopying]  = useState(false)
  const [copied,   setCopied]   = useState(false)
  const [needAuth, setNeedAuth] = useState(false)

  useEffect(() => {
    if (!id) return
    fetch(`${WORKER}/api/lists/${id}/public`)
      .then(async r => {
        if (!r.ok) {
          const json = await r.json().catch(() => ({})) as { error?: string }
          throw new Error(json.error ?? `Error ${r.status}`)
        }
        return r.json() as Promise<{ data: { list: ListRow; items: EnrichedItem[] } }>
      })
      .then(({ data }) => { setList(data.list); setItems(data.items) })
      .catch(e => setError((e as Error).message))
      .finally(() => setLoading(false))
  }, [id])

  async function handleCopyList() {
    if (!user || !token) { setNeedAuth(true); return }
    setCopying(true)
    try {
      const res = await fetch(`${WORKER}/api/lists/${id}/copy`, {
        method:  'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) setCopied(true)
    } finally {
      setCopying(false)
    }
  }

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
          <Link href="/" className="text-xs font-bold border-2 border-black px-2 py-1 hover:bg-black hover:text-white">
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
        <Link href="/" className="text-xs font-bold border-2 border-black px-2 py-1 hover:bg-black hover:text-white">
          ← Back to map
        </Link>
        <span className="text-xs text-gray-400">Shared list</span>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <h1 className="text-2xl font-extrabold leading-tight text-gray-900">{list.name}</h1>
            {list.description && (
              <p className="text-sm text-gray-500 mt-1">{list.description}</p>
            )}
            <p className="text-[10px] text-gray-400 mt-2">
              {items.length} item{items.length !== 1 ? 's' : ''}
            </p>
          </div>

          <div className="flex flex-col items-end gap-1.5 shrink-0">
            {copied ? (
              <span className="text-xs font-bold flex items-center gap-1.5 border-2 border-black px-3 py-1.5 bg-white">
                <Check size={12} /> Saved to your lists
              </span>
            ) : (
              <button
                onClick={handleCopyList}
                disabled={copying}
                className="text-xs font-bold flex items-center gap-1.5 border-2 border-black px-3 py-1.5 bg-black text-white hover:bg-white hover:text-black disabled:opacity-40"
              >
                <BookCopy size={12} />
                {copying ? 'Saving…' : 'Save whole list'}
              </button>
            )}
            {needAuth && !user && (
              <p className="text-[10px] text-gray-500">
                <Link href="/" className="underline hover:text-black">Sign in</Link> to save items
              </p>
            )}
          </div>
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
                <div key={item.id} className="border-2 border-black px-3 py-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-gray-900 leading-snug truncate">
                        {item.title ?? item.item_id}
                      </p>
                      {item.subtitle && (
                        <p className="text-[10px] text-gray-500 mt-0.5">{item.subtitle}</p>
                      )}
                      {item.notes && (
                        <p className="text-xs text-gray-400 italic mt-1">"{item.notes}"</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0 mt-0.5">
                      <AddToListButton
                        itemType="location"
                        itemId={item.item_id}
                        onNeedAuth={() => setNeedAuth(true)}
                      />
                      <Link
                        href={`/locations/${item.item_id}`}
                        className="text-[10px] border border-black px-1.5 py-1 hover:bg-black hover:text-white flex items-center gap-0.5"
                      >
                        View <ExternalLink size={8} />
                      </Link>
                    </div>
                  </div>
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
                <div key={item.id} className="border-2 border-black px-3 py-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-gray-900 leading-snug truncate">
                        {item.title ?? item.item_id}
                      </p>
                      {item.subtitle && (
                        <p className="text-[10px] text-gray-500 mt-0.5">{item.subtitle}</p>
                      )}
                      {item.notes && (
                        <p className="text-xs text-gray-400 italic mt-1">"{item.notes}"</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0 mt-0.5">
                      <AddToListButton
                        itemType="event"
                        itemId={item.item_id}
                        onNeedAuth={() => setNeedAuth(true)}
                      />
                      <Link
                        href={`/events/${item.item_id}`}
                        className="text-[10px] border border-black px-1.5 py-1 hover:bg-black hover:text-white flex items-center gap-0.5"
                      >
                        View <ExternalLink size={8} />
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  )
}

export default function PublicListPage() {
  return (
    <UserProvider>
      <PublicListContent />
    </UserProvider>
  )
}
