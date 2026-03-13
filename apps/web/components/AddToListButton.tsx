'use client'
import { useState, useRef, useEffect } from 'react'
import { Bookmark } from 'lucide-react'
import { useUser } from '@/providers/UserProvider'

interface Props {
  itemType: 'event' | 'location'
  itemId:   string
  onNeedAuth: () => void
}

export default function AddToListButton({ itemType, itemId, onNeedAuth }: Props) {
  const { user, lists, addToList, createList } = useUser()
  const [open,     setOpen]     = useState(false)
  const [loading,  setLoading]  = useState<string | null>(null)
  const [added,    setAdded]    = useState<Set<string>>(new Set())
  const [newName,  setNewName]  = useState('')
  const [creating, setCreating] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function handleOpen(e: React.MouseEvent) {
    e.stopPropagation()
    if (!user) { onNeedAuth(); return }
    setOpen(o => !o)
  }

  async function handleAdd(listId: string) {
    setLoading(listId)
    try {
      await addToList(listId, itemType, itemId)
      setAdded(prev => new Set([...prev, listId]))
    } finally {
      setLoading(null)
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim()) return
    setCreating(true)
    try {
      const list = await createList(newName.trim(), '', false)
      await handleAdd(list.id)
      setNewName('')
    } finally {
      setCreating(false)
    }
  }

  const isAdded = lists.some(l => added.has(l.id))

  return (
    <div ref={ref} className="relative" onClick={e => e.stopPropagation()}>
      <button
        onClick={handleOpen}
        title="Add to list"
        className={`flex items-center justify-center w-7 h-7 border border-black hover:bg-black hover:text-white transition-colors ${isAdded ? 'bg-black text-white' : 'bg-white text-black'}`}
      >
        <Bookmark size={12} fill={isAdded ? 'currentColor' : 'none'} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 bg-white border-2 border-black shadow-[3px_3px_0_#000] w-48">
          {lists.length === 0 ? (
            <p className="text-[10px] text-gray-400 px-3 py-2">No lists yet. Create one:</p>
          ) : (
            <div className="py-1 max-h-40 overflow-y-auto">
              {lists.map(list => (
                <button
                  key={list.id}
                  onClick={() => handleAdd(list.id)}
                  disabled={loading === list.id || added.has(list.id)}
                  className="w-full text-left px-3 py-1.5 text-[11px] flex items-center justify-between hover:bg-gray-100 disabled:opacity-50"
                >
                  <span className="truncate">{list.name}</span>
                  {added.has(list.id) && <span className="text-[9px] ml-1 shrink-0">✓</span>}
                  {loading === list.id && <span className="text-[9px] ml-1 shrink-0 text-gray-400">…</span>}
                </button>
              ))}
            </div>
          )}
          <div className="border-t border-gray-200">
            <form onSubmit={handleCreate} className="flex gap-1 p-2">
              <input
                type="text"
                placeholder="New list…"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                className="flex-1 text-[10px] border border-black px-1.5 py-1 outline-none min-w-0"
                onClick={e => e.stopPropagation()}
              />
              <button
                type="submit"
                disabled={creating || !newName.trim()}
                className="text-[10px] border border-black px-1.5 py-1 hover:bg-black hover:text-white disabled:opacity-40 shrink-0"
              >
                +
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
