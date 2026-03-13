'use client'
import { useState, useRef, useEffect } from 'react'
import { X } from 'lucide-react'
import { useUser } from '@/providers/UserProvider'

interface Props {
  onClose: () => void
}

export default function AuthModal({ onClose }: Props) {
  const { login, logout, user, updateDisplayName } = useUser()
  const [email,     setEmail]     = useState('')
  const [name,      setName]      = useState(user?.display_name ?? '')
  const [step,      setStep]      = useState<'email' | 'sent' | 'profile'>(() => user ? 'profile' : 'email')
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState('')
  const [magicLink, setMagicLink] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [step])

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const result = await login(email.trim().toLowerCase())
      setMagicLink(result.dev_link ?? null)
      setStep('sent')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  async function handleSaveName(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setLoading(true)
    try {
      await updateDisplayName(name.trim())
      onClose()
    } finally {
      setLoading(false)
    }
  }

  const btn = 'text-xs border-2 border-black px-3 py-1.5 font-bold bg-white hover:bg-black hover:text-white disabled:opacity-40'
  const btnPrimary = 'text-xs border-2 border-black px-3 py-1.5 font-bold bg-black text-white hover:bg-white hover:text-black disabled:opacity-40'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white border-2 border-black shadow-[4px_4px_0_#000] w-full max-w-sm mx-4 p-6"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-sm font-extrabold uppercase tracking-wide">
            {user ? 'Your account' : 'Sign in'}
          </h2>
          <button onClick={onClose} className="w-6 h-6 flex items-center justify-center border border-black hover:bg-black hover:text-white">
            <X size={12} />
          </button>
        </div>

        {step === 'email' && (
          <form onSubmit={handleSend} className="space-y-3">
            <p className="text-xs text-gray-500">
              Enter your email and we&apos;ll send you a sign-in link. No password needed.
            </p>
            <input
              ref={inputRef}
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              className="w-full text-xs border-2 border-black px-3 py-2 outline-none focus:shadow-[2px_2px_0_#000]"
            />
            {error && <p className="text-[10px] text-red-600">{error}</p>}
            <button type="submit" disabled={loading || !email} className={`${btnPrimary} w-full`}>
              {loading ? 'Sending…' : 'Send magic link'}
            </button>
          </form>
        )}

        {step === 'sent' && (
          <div className="space-y-3">
            {magicLink ? (
              <>
                <p className="text-xs font-semibold">Your sign-in link is ready</p>
                <p className="text-xs text-gray-500">
                  Click below to sign in as <strong>{email}</strong>. Expires in 15 minutes.
                </p>
                <a
                  href={magicLink}
                  className={`${btnPrimary} w-full block text-center`}
                >
                  Sign in →
                </a>
              </>
            ) : (
              <>
                <p className="text-xs font-semibold">Check your inbox!</p>
                <p className="text-xs text-gray-500">
                  We sent a sign-in link to <strong>{email}</strong>. Click it to sign in — it expires in 15 minutes.
                </p>
              </>
            )}
            <button onClick={() => { setStep('email'); setMagicLink(null) }} className={btn}>
              Use a different email
            </button>
          </div>
        )}

        {step === 'profile' && user && (
          <div className="space-y-4">
            <div className="text-xs text-gray-500 border border-gray-200 px-3 py-2 font-mono">
              {user.email}
            </div>
            <form onSubmit={handleSaveName} className="space-y-3">
              <label className="block">
                <span className="text-[10px] uppercase tracking-wide font-bold text-gray-500">Display name</span>
                <input
                  ref={inputRef}
                  type="text"
                  placeholder="Your name"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="mt-1 w-full text-xs border-2 border-black px-3 py-2 outline-none focus:shadow-[2px_2px_0_#000]"
                />
              </label>
              <button type="submit" disabled={loading || !name.trim()} className={`${btnPrimary} w-full`}>
                Save
              </button>
            </form>
            <button
              onClick={() => { logout(); onClose() }}
              className="text-[10px] text-gray-400 underline"
            >
              Sign out
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
