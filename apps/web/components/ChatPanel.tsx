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
          className="fixed bottom-5 right-5 z-50 bg-black text-white p-3 border-2 border-black shadow-[4px_4px_0_#555] hover:shadow-none hover:translate-x-1 hover:translate-y-1"
          aria-label="Open chat"
        >
          <MessageSquare size={20} />
        </button>
      )}

      {/* Panel */}
      {open && (
        <div className="fixed bottom-5 right-5 z-50 w-80 max-h-[480px] flex flex-col bg-white border-2 border-black shadow-[4px_4px_0_#000] overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b-2 border-black bg-black text-white">
            <span className="text-sm font-bold">Ask about today's events</span>
            <button onClick={() => setOpen(false)} className="hover:opacity-70">
              <X size={16} />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2 text-sm min-h-0">
            {messages.length === 0 && (
              <p className="text-gray-400 text-xs text-center mt-4">
                Ask anything — "free music tonight", "exhibitions in Mitte"…
              </p>
            )}
            {messages.map((m, i) => (
              <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                <div className={
                  m.role === 'user'
                    ? 'bg-black text-white px-3 py-2 max-w-[85%] text-xs border-2 border-black'
                    : 'bg-gray-100 text-gray-900 px-3 py-2 max-w-[85%] text-xs border-2 border-black'
                }>
                  {m.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-gray-100 text-gray-400 px-3 py-2 text-xs border-2 border-gray-300">
                  Thinking…
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="flex items-center gap-2 px-3 py-2 border-t-2 border-black">
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && send()}
              placeholder="Ask about events…"
              className="flex-1 text-xs border-2 border-black px-3 py-2 outline-none focus:bg-gray-50"
            />
            <button
              onClick={send}
              disabled={!input.trim() || loading}
              className="p-2 bg-black text-white border-2 border-black disabled:opacity-40 hover:bg-gray-800"
            >
              <Send size={14} />
            </button>
          </div>
        </div>
      )}
    </>
  )
}
