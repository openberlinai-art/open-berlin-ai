'use client'
import { useState, useRef, useEffect } from 'react'
import { Send, X, MessageSquare } from 'lucide-react'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface Props {
  date: string
}

export default function ChatPanel({ date }: Props) {
  const [open,     setOpen]     = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input,    setInput]    = useState('')
  const [loading,  setLoading]  = useState(false)
  const bottomRef  = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function send() {
    const text = input.trim()
    if (!text || loading) return
    setInput('')
    const next: Message[] = [...messages, { role: 'user', content: text }]
    setMessages(next)
    setLoading(true)
    try {
      const res  = await fetch('/api/chat', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ messages: next, date }),
      })
      const data = await res.json()
      const reply = data.response ?? data.error ?? 'No response'
      setMessages(m => [...m, { role: 'assistant', content: reply }])
    } catch {
      setMessages(m => [...m, { role: 'assistant', content: 'Something went wrong.' }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {/* FAB */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-50 bg-violet-600 text-white rounded-full p-3 shadow-lg hover:bg-violet-700 transition-colors"
          aria-label="Open chat"
        >
          <MessageSquare size={22} />
        </button>
      )}

      {/* Panel */}
      {open && (
        <div className="fixed bottom-5 right-5 z-50 w-80 max-h-[480px] flex flex-col bg-white border border-gray-200 rounded-xl shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-violet-600">
            <span className="text-sm font-semibold text-white">Ask about today's events</span>
            <button onClick={() => setOpen(false)} className="text-white/80 hover:text-white">
              <X size={16} />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2 text-sm min-h-0">
            {messages.length === 0 && (
              <p className="text-gray-400 text-xs text-center mt-4">
                Ask anything — "free music events tonight", "exhibitions in Mitte", etc.
              </p>
            )}
            {messages.map((m, i) => (
              <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                <div className={
                  m.role === 'user'
                    ? 'bg-violet-600 text-white rounded-2xl rounded-br-sm px-3 py-2 max-w-[85%] text-xs'
                    : 'bg-gray-100 text-gray-800 rounded-2xl rounded-bl-sm px-3 py-2 max-w-[85%] text-xs'
                }>
                  {m.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-gray-100 text-gray-400 rounded-2xl rounded-bl-sm px-3 py-2 text-xs">
                  Thinking…
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="flex items-center gap-2 px-3 py-2 border-t border-gray-100">
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && send()}
              placeholder="Ask about events…"
              className="flex-1 text-xs border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-violet-400"
            />
            <button
              onClick={send}
              disabled={!input.trim() || loading}
              className="p-2 rounded-lg bg-violet-600 text-white disabled:opacity-40 hover:bg-violet-700 transition-colors"
            >
              <Send size={14} />
            </button>
          </div>
        </div>
      )}
    </>
  )
}
