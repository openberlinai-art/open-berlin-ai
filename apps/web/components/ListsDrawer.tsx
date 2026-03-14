'use client'
import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { X, Trash2, Link as LinkIcon, Plus, ChevronDown, ChevronUp, Mail } from 'lucide-react'
import { useUser, type KPListItem } from '@/providers/UserProvider'
import { formatDate } from '@/lib/utils'

interface ItemDetail { title: string; subtitle?: string }

interface Props {
  onClose: () => void
}

export default function ListsDrawer({ onClose }: Props) {
  const { lists, deleteList, removeFromList, createList, getListItems, shareList } = useUser()
  const [expanded,    setExpanded]    = useState<string | null>(null)
  const [items,       setItems]       = useState<Record<string, KPListItem[]>>({})
  const [newName,     setNewName]     = useState('')
  const [creating,    setCreating]    = useState(false)
  const [showCreate,  setShowCreate]  = useState(false)
  const [shareListId, setShareListId] = useState<string | null>(null)
  const [shareEmail,  setShareEmail]  = useState('')
  const [shareStatus, setShareStatus] = useState<Record<string, 'idle' | 'sending' | 'ok' | 'error'>>({})
  const [shareError,  setShareError]  = useState<Record<string, string>>({})
  const [details,     setDetails]     = useState<Record<string, ItemDetail>>({})

  async function handleShare(listId: string, e: React.FormEvent) {
    e.preventDefault()
    if (!shareEmail.trim()) return
    setShareStatus(p => ({ ...p, [listId]: 'sending' }))
    const result = await shareList(listId, shareEmail.trim())
    if (result.ok) {
      setShareStatus(p => ({ ...p, [listId]: 'ok' }))
      setShareEmail('')
      setTimeout(() => {
        setShareStatus(p => ({ ...p, [listId]: 'idle' }))
        setShareListId(null)
      }, 2000)
    } else {
      setShareStatus(p => ({ ...p, [listId]: 'error' }))
      setShareError(p => ({ ...p, [listId]: result.error ?? 'Failed' }))
    }
  }

  const loadItems = useCallback(async (listId: string) => {
    const data = await getListItems(listId)
    setItems(prev => ({ ...prev, [listId]: data }))
  }, [getListItems])

  useEffect(() => {
    if (expanded) loadItems(expanded)
  }, [expanded, loadItems])

  // Fetch details (title, date) for each item when a list is expanded
  useEffect(() => {
    if (!expanded || !items[expanded]) return
    const toFetch = items[expanded].filter(i => !details[i.item_id])
    if (!toFetch.length) return
    toFetch.forEach(async item => {
      try {
        const path = item.item_type === 'event'
          ? `/api/events/${item.item_id}`
          : `/api/locations/${item.item_id}`
        const res = await fetch(path)
        if (!res.ok) return
        const json = await res.json() as { data: Record<string, unknown> }
        const d = json.data
        const title    = (item.item_type === 'event' ? d.title    : d.name)    as string ?? item.item_id
        const subtitle = (item.item_type === 'event' ? formatDate(d.date_start as string) : d.category) as string | undefined
        setDetails(prev => ({ ...prev, [item.item_id]: { title, subtitle } }))
      } catch { /* ignore */ }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, expanded])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim()) return
    setCreating(true)
    try {
      await createList(newName.trim(), '', false)
      setNewName('')
      setShowCreate(false)
    } finally {
      setCreating(false)
    }
  }

  async function handleRemoveItem(listId: string, itemId: string) {
    await removeFromList(listId, itemId)
    await loadItems(listId)
  }

  function copyShareLink(listId: string) {
    const url = `${window.location.origin}/lists/${listId}`
    navigator.clipboard.writeText(url).catch(() => {})
  }

  const btn = 'text-[10px] border border-black px-2 py-1 hover:bg-black hover:text-white flex items-center gap-1'

  return (
    <div className="fixed inset-0 z-50 flex" onClick={onClose}>
      <div className="flex-1" />
      <div
        className="w-80 h-full bg-white border-l-2 border-black shadow-[-4px_0_0_#000] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b-2 border-black">
          <h2 className="text-sm font-extrabold uppercase tracking-wide">My Lists</h2>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center border-2 border-black hover:bg-black hover:text-white">
            <X size={12} />
          </button>
        </div>

        {/* Create button */}
        <div className="px-4 py-2 border-b-2 border-black">
          {!showCreate ? (
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-1 text-xs font-bold border-2 border-black px-2.5 py-1 hover:bg-black hover:text-white w-full justify-center"
            >
              <Plus size={11} /> New list
            </button>
          ) : (
            <form onSubmit={handleCreate} className="flex gap-1.5">
              <input
                autoFocus
                type="text"
                placeholder="List name…"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                className="flex-1 text-xs border-2 border-black px-2 py-1 outline-none focus:shadow-[2px_2px_0_#000] min-w-0"
              />
              <button type="submit" disabled={creating || !newName.trim()} className="text-xs border-2 border-black px-2 py-1 bg-black text-white hover:bg-white hover:text-black disabled:opacity-40 shrink-0">
                {creating ? '…' : 'Create'}
              </button>
              <button type="button" onClick={() => { setShowCreate(false); setNewName('') }} className="text-xs border-2 border-black px-2 py-1 hover:bg-black hover:text-white shrink-0">
                ✕
              </button>
            </form>
          )}
        </div>

        {/* Lists */}
        <div className="flex-1 overflow-y-auto">
          {lists.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-8">No lists yet.<br />Create one above.</p>
          ) : (
            lists.map(list => (
              <div key={list.id} className="border-b border-gray-200">
                {/* List header */}
                <div className="flex items-center gap-1 px-3 py-2.5">
                  <button
                    onClick={() => setExpanded(expanded === list.id ? null : list.id)}
                    className="flex-1 text-left flex items-center gap-1.5 min-w-0"
                  >
                    {expanded === list.id ? <ChevronUp size={11} className="shrink-0" /> : <ChevronDown size={11} className="shrink-0" />}
                    <span className="text-xs font-bold truncate">{list.name}</span>
                    <span className="text-[10px] text-gray-400 shrink-0">({list.item_count})</span>
                  </button>
                  <button onClick={() => copyShareLink(list.id)} className={btn} title="Copy share link">
                    <LinkIcon size={9} />
                  </button>
                  <button
                    onClick={() => { setShareListId(shareListId === list.id ? null : list.id); setShareEmail(''); setShareStatus(p => ({ ...p, [list.id]: 'idle' })) }}
                    className={btn}
                    title="Share by email"
                  >
                    <Mail size={9} />
                  </button>
                  <button onClick={() => deleteList(list.id)} className={`${btn} text-red-600 hover:bg-red-600 hover:text-white border-red-600`} title="Delete list">
                    <Trash2 size={9} />
                  </button>
                </div>

                {/* Share by email form */}
                {shareListId === list.id && (
                  <div className="px-3 pb-2">
                    {shareStatus[list.id] === 'ok' ? (
                      <p className="text-[10px] text-green-600 font-bold py-1">Shared!</p>
                    ) : (
                      <form onSubmit={e => handleShare(list.id, e)} className="flex gap-1">
                        <input
                          autoFocus
                          type="text"
                          placeholder="Email or username…"
                          value={shareEmail}
                          onChange={e => setShareEmail(e.target.value)}
                          className="flex-1 text-[10px] border border-black px-1.5 py-1 outline-none min-w-0"
                        />
                        <button
                          type="submit"
                          disabled={shareStatus[list.id] === 'sending' || !shareEmail.trim()}
                          className="text-[10px] border border-black px-1.5 py-1 bg-black text-white hover:bg-white hover:text-black disabled:opacity-40 shrink-0"
                        >
                          {shareStatus[list.id] === 'sending' ? '…' : 'Send'}
                        </button>
                      </form>
                    )}
                    {shareStatus[list.id] === 'error' && (
                      <p className="text-[10px] text-red-500 mt-0.5">{shareError[list.id]}</p>
                    )}
                  </div>
                )}

                {/* Items */}
                {expanded === list.id && (
                  <div className="px-3 pb-2 space-y-1">
                    {!items[list.id] ? (
                      <p className="text-[10px] text-gray-400 py-1">Loading…</p>
                    ) : items[list.id].length === 0 ? (
                      <p className="text-[10px] text-gray-400 py-1">No items yet.</p>
                    ) : (
                      items[list.id].map(item => {
                        const det  = details[item.item_id]
                        const href = item.item_type === 'event'
                          ? `/events/${item.item_id}`
                          : `/locations/${item.item_id}`
                        return (
                          <div key={item.id} className="flex items-start justify-between gap-1.5 border border-gray-200 px-2 py-1.5">
                            <div className="min-w-0 flex-1">
                              <span className="text-[9px] uppercase tracking-wide text-gray-400 font-bold">{item.item_type}</span>
                              <Link
                                href={href}
                                className="block text-xs font-bold text-gray-900 hover:underline leading-snug mt-0.5"
                              >
                                {det?.title ?? <span className="font-mono text-[10px] text-gray-400">{item.item_id}</span>}
                              </Link>
                              {det?.subtitle && (
                                <p className="text-[10px] text-gray-500 mt-0.5">{det.subtitle}</p>
                              )}
                              {item.notes && <p className="text-[10px] text-gray-400 italic mt-0.5 truncate">"{item.notes}"</p>}
                            </div>
                            <button
                              onClick={() => handleRemoveItem(list.id, item.id)}
                              className="shrink-0 mt-0.5 w-5 h-5 flex items-center justify-center border border-gray-300 hover:border-black hover:bg-black hover:text-white text-gray-400"
                              title="Remove"
                            >
                              <X size={9} />
                            </button>
                          </div>
                        )
                      })
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
