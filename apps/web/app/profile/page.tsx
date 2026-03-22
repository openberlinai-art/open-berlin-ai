'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useUser } from '@/providers/UserProvider'
import { usePushSubscription } from '@/hooks/usePushSubscription'

const ALL_CATEGORIES = [
  'Exhibition','Music','Dance','Recreation','Kids','Sports',
  'Tours','Film','Theater','Talks','Literature','Other',
]

const ALL_BOROUGHS = [
  'Mitte','Friedrichshain-Kreuzberg','Pankow',
  'Charlottenburg-Wilmersdorf','Spandau','Steglitz-Zehlendorf',
  'Tempelhof-Schöneberg','Neukölln','Treptow-Köpenick',
  'Marzahn-Hellersdorf','Lichtenberg','Reinickendorf',
]

export default function ProfilePage() {
  const {
    user, token, logout,
    updateDisplayName,
    preferences, updatePreferences,
    digestOptIn, updateDigestOptIn,
  } = useUser()

  const { isSubscribed, loading: pushLoading, subscribe, unsubscribe } = usePushSubscription()

  const [displayName, setDisplayName] = useState('')
  const [nameSaving,  setNameSaving]  = useState(false)
  const [nameSaved,   setNameSaved]   = useState(false)

  const [selCats,     setSelCats]     = useState<string[]>([])
  const [selBoroughs, setSelBoroughs] = useState<string[]>([])
  const [prefSaving,  setPrefSaving]  = useState(false)
  const [prefSaved,   setPrefSaved]   = useState(false)

  // Sync from context
  useEffect(() => {
    if (user?.display_name) setDisplayName(user.display_name)
  }, [user?.display_name])

  useEffect(() => {
    setSelCats(preferences.categories ?? [])
    setSelBoroughs(preferences.boroughs ?? [])
  }, [preferences])

  if (!token) {
    return (
      <main className="min-h-screen bg-[var(--bg-primary)] font-sans flex flex-col items-center justify-center">
        <p className="text-sm text-[var(--text-secondary)] mb-4">Sign in to view your profile.</p>
        <Link href="/" className="text-xs font-bold border-2 border-[var(--border-primary)] px-3 py-1.5 hover:bg-[var(--accent)] hover:text-[var(--accent-text)]">
          ← Back to map
        </Link>
      </main>
    )
  }

  async function saveName() {
    if (!displayName.trim()) return
    setNameSaving(true)
    try {
      await updateDisplayName(displayName.trim())
      setNameSaved(true)
      setTimeout(() => setNameSaved(false), 2000)
    } finally {
      setNameSaving(false)
    }
  }

  async function savePreferences() {
    setPrefSaving(true)
    try {
      await updatePreferences({ categories: selCats, boroughs: selBoroughs })
      setPrefSaved(true)
      setTimeout(() => setPrefSaved(false), 2000)
    } finally {
      setPrefSaving(false)
    }
  }

  function toggleChip(list: string[], setList: (v: string[]) => void, value: string) {
    setList(list.includes(value) ? list.filter(x => x !== value) : [...list, value])
  }

  return (
    <main className="min-h-screen bg-[var(--bg-primary)] font-sans">
      {/* Nav */}
      <div className="border-b-2 border-[var(--border-primary)] px-4 py-3 flex items-center gap-3">
        <Link href="/" className="text-xs font-bold border-2 border-[var(--border-primary)] px-2 py-1 hover:bg-[var(--accent)] hover:text-[var(--accent-text)] transition-colors">
          ← Back to map
        </Link>
        <span className="text-xs text-[var(--text-muted)]">My Profile</span>
      </div>

      <div className="max-w-lg mx-auto px-4 py-8 space-y-8">

        {/* Account */}
        <section>
          <h2 className="text-xs font-bold uppercase tracking-widest text-[var(--text-muted)] mb-3 border-b border-[var(--border-secondary)] pb-1">
            Account
          </h2>
          <p className="text-xs text-[var(--text-secondary)] mb-3 font-mono">{user?.email}</p>

          {/* Display name */}
          <label className="block mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Display name</span>
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              placeholder="Your name"
              className="flex-1 text-xs border-2 border-[var(--border-primary)] px-2.5 py-1.5 outline-none focus:shadow-[2px_2px_0_var(--border-primary)]"
              onKeyDown={e => e.key === 'Enter' && saveName()}
            />
            <button
              onClick={saveName}
              disabled={nameSaving || !displayName.trim()}
              className="text-xs border-2 border-[var(--border-primary)] px-3 py-1.5 hover:bg-[var(--accent)] hover:text-[var(--accent-text)] disabled:opacity-40 font-bold"
            >
              {nameSaved ? 'Saved ✓' : nameSaving ? '…' : 'Save'}
            </button>
          </div>
        </section>

        {/* Notifications */}
        <section>
          <h2 className="text-xs font-bold uppercase tracking-widest text-[var(--text-muted)] mb-3 border-b border-[var(--border-secondary)] pb-1">
            Notifications
          </h2>
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <div
              onClick={() => updateDigestOptIn(!digestOptIn)}
              className={`w-8 h-4 border-2 border-[var(--border-primary)] relative transition-colors cursor-pointer ${digestOptIn ? 'bg-[var(--accent)]' : 'bg-[var(--bg-primary)]'}`}
            >
              <div className={`absolute top-0 w-3 h-3 bg-[var(--bg-primary)] border border-[var(--border-primary)] transition-transform ${digestOptIn ? 'translate-x-4' : 'translate-x-0'}`} />
            </div>
            <span className="text-xs text-[var(--text-secondary)]">Weekly digest email (Monday)</span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer select-none mt-3">
            <div
              onClick={() => isSubscribed ? unsubscribe() : subscribe()}
              className={`w-8 h-4 border-2 border-[var(--border-primary)] relative cursor-pointer ${isSubscribed ? 'bg-[var(--accent)]' : 'bg-[var(--bg-primary)]'}`}
            >
              <div className={`absolute top-0 w-3 h-3 bg-[var(--bg-primary)] border border-[var(--border-primary)] ${isSubscribed ? 'translate-x-4' : 'translate-x-0'}`} />
            </div>
            <span className="text-xs text-[var(--text-secondary)]">Push notifications (event reminders)</span>
          </label>
        </section>

        {/* Preferred categories */}
        <section>
          <h2 className="text-xs font-bold uppercase tracking-widest text-[var(--text-muted)] mb-1 border-b border-[var(--border-secondary)] pb-1">
            Preferred categories
          </h2>
          <p className="text-[10px] text-[var(--text-muted)] mb-2">Used to personalise your event recommendations.</p>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {ALL_CATEGORIES.map(c => (
              <button
                key={c}
                onClick={() => toggleChip(selCats, setSelCats, c)}
                className={`text-[10px] px-2 py-0.5 border-2 font-bold transition-colors ${
                  selCats.includes(c)
                    ? 'border-[var(--border-primary)] bg-[var(--accent)] text-[var(--accent-text)]'
                    : 'border-[var(--border-primary)] bg-[var(--bg-primary)] text-black hover:bg-[var(--bg-secondary)]'
                }`}
              >
                {c}
              </button>
            ))}
          </div>

          {/* Preferred boroughs */}
          <h2 className="text-xs font-bold uppercase tracking-widest text-[var(--text-muted)] mb-1 border-b border-[var(--border-secondary)] pb-1 mt-5">
            Preferred districts
          </h2>
          <p className="text-[10px] text-[var(--text-muted)] mb-2">Filter events to your favourite neighbourhoods.</p>
          <div className="flex flex-wrap gap-1.5 mb-4">
            {ALL_BOROUGHS.map(b => (
              <button
                key={b}
                onClick={() => toggleChip(selBoroughs, setSelBoroughs, b)}
                className={`text-[10px] px-2 py-0.5 border-2 font-bold transition-colors ${
                  selBoroughs.includes(b)
                    ? 'border-[var(--border-primary)] bg-[var(--accent)] text-[var(--accent-text)]'
                    : 'border-[var(--border-primary)] bg-[var(--bg-primary)] text-black hover:bg-[var(--bg-secondary)]'
                }`}
              >
                {b}
              </button>
            ))}
          </div>

          <button
            onClick={savePreferences}
            disabled={prefSaving}
            className="text-xs border-2 border-[var(--border-primary)] px-3 py-1.5 hover:bg-[var(--accent)] hover:text-[var(--accent-text)] disabled:opacity-40 font-bold"
          >
            {prefSaved ? 'Saved ✓' : prefSaving ? 'Saving…' : 'Save preferences'}
          </button>
        </section>

        {/* Sign out */}
        <section className="pt-4 border-t-2 border-[var(--border-primary)]">
          <button
            onClick={() => { logout(); window.location.href = '/' }}
            className="text-xs border-2 border-[var(--border-primary)] px-3 py-1.5 hover:bg-red-600 hover:text-white hover:border-red-600 font-bold transition-colors"
          >
            Sign out
          </button>
        </section>
      </div>
    </main>
  )
}
