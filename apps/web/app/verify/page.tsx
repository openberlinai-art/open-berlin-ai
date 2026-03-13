'use client'
import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

const WORKER    = process.env.NEXT_PUBLIC_API_URL ?? 'https://kulturpulse-worker.openberlinai.workers.dev'
const TOKEN_KEY = 'kp_token'

function VerifyInner() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [error,  setError]  = useState('')

  useEffect(() => {
    const token = searchParams.get('token')
    if (!token) { setStatus('error'); setError('No token provided.'); return }

    fetch(`${WORKER}/api/auth/verify?token=${encodeURIComponent(token)}`)
      .then(async res => {
        if (!res.ok) {
          const json = await res.json() as { error?: string }
          throw new Error(json.error ?? `HTTP ${res.status}`)
        }
        return res.json() as Promise<{ token: string }>
      })
      .then(({ token: jwt }) => {
        localStorage.setItem(TOKEN_KEY, jwt)
        setStatus('success')
        setTimeout(() => router.replace('/'), 1000)
      })
      .catch(err => {
        setStatus('error')
        setError(err instanceof Error ? err.message : 'Verification failed.')
      })
  }, [searchParams, router])

  return (
    <main className="min-h-screen bg-white flex items-center justify-center font-sans">
      <div className="border-2 border-black p-8 max-w-sm w-full mx-4">
        <h1 className="text-lg font-extrabold mb-4">KulturPulse</h1>
        {status === 'loading' && (
          <p className="text-sm text-gray-500">Verifying your sign-in link…</p>
        )}
        {status === 'success' && (
          <p className="text-sm font-semibold">Signed in! Redirecting…</p>
        )}
        {status === 'error' && (
          <div>
            <p className="text-sm text-red-600 font-semibold mb-2">Link invalid or expired.</p>
            <p className="text-xs text-gray-500 mb-4">{error}</p>
            <a
              href="/"
              className="text-xs border-2 border-black px-3 py-1.5 font-bold hover:bg-black hover:text-white"
            >
              Back to map
            </a>
          </div>
        )}
      </div>
    </main>
  )
}

export default function VerifyPage() {
  return (
    <Suspense>
      <VerifyInner />
    </Suspense>
  )
}
