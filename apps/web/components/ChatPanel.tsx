'use client'
import { useState, useRef, useEffect } from 'react'
import { Send, X, MessageSquare } from 'lucide-react'

function renderMarkdown(raw: string): string {
  // Escape HTML entities first
  let s = raw
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  // Bold **text**
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  // Italic *text* (not inside bold)
  s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>')
  // Links [text](url)
  s = s.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer" class="underline text-blue-600 hover:text-blue-800 break-all">$1</a>'
  )
  // Bullet list items at line start
  s = s.replace(/^[*-] (.+)$/gm, '<span class="flex gap-1.5 mt-0.5"><span class="shrink-0">·</span><span>$1</span></span>')
  // Double newline → paragraph gap
  s = s.replace(/\n{2,}/g, '<br/><br/>')
  // Single newline → break
  s = s.replace(/\n/g, '<br/>')
  return s
}

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface Props {
  date: string
  viewport?: { lat: number; lng: number; zoom: number }
}

export default function ChatPanel({ date, viewport }: Props) {
  const [open,     setOpen]     = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input,    setInput]    = useState('')
  const [loading,  setLoading]  = useState(false)
  const bottomRef  = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function send(overrideText?: string) {
    const text = (overrideText ?? input).trim()
    if (!text || loading) return
    setInput('')
    const next: Message[] = [...messages, { role: 'user', content: text }]
    setMessages(next)
    setLoading(true)
    try {
      const res = await fetch('/api/chat', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ messages: next, date, viewport }),
      })

      const contentType = res.headers.get('Content-Type') ?? ''

      if (contentType.includes('text/event-stream') && res.body) {
        // Stream SSE tokens
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let assistantContent = ''
        setMessages(m => [...m, { role: 'assistant', content: '' }])

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          const chunk = decoder.decode(value, { stream: true })
          const lines = chunk.split('\n')
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const payload = line.slice(6).trim()
              if (payload === '[DONE]') break
              try {
                const parsed = JSON.parse(payload)
                if (parsed.response) {
                  assistantContent += parsed.response
                  const content = assistantContent
                  setMessages(m => {
                    const updated = [...m]
                    updated[updated.length - 1] = { role: 'assistant', content }
                    return updated
                  })
                }
              } catch { /* skip malformed SSE lines */ }
            }
          }
        }
      } else {
        const data = await res.json()
        const reply = data.response ?? data.error ?? 'No response'
        setMessages(m => [...m, { role: 'assistant', content: reply }])
      }
    } catch {
      setMessages(m => [...m, { role: 'assistant', content: 'Something went wrong.' }])
    } finally {
      setLoading(false)
    }
  }

  const suggestedPrompts = [
    'Free events today',
    'Live music tonight',
    'Cafes in Kreuzberg',
    'Family-friendly this weekend',
    'Exhibitions near me',
  ]

  return (
    <>
      {/* FAB */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-20 right-5 sm:bottom-5 z-50 bg-black text-white p-3 border-2 border-black shadow-[4px_4px_0_#555] hover:shadow-none hover:translate-x-1 hover:translate-y-1"
          aria-label="Open chat"
        >
          <MessageSquare size={20} />
        </button>
      )}

      {/* Panel */}
      {open && (
        <div className="fixed bottom-20 right-5 sm:bottom-5 z-50 w-80 max-h-[480px] flex flex-col bg-white border-2 border-black shadow-[4px_4px_0_#000] overflow-hidden">
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
              <div className="mt-3 space-y-2">
                <p className="text-gray-400 text-[10px] text-center">Ask anything or try:</p>
                <div className="flex flex-wrap gap-1.5 justify-center">
                  {suggestedPrompts.map(prompt => (
                    <button
                      key={prompt}
                      onClick={() => send(prompt)}
                      className="text-[10px] border border-gray-300 px-2 py-1 hover:border-black hover:bg-gray-50 transition-colors"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                <div className={
                  m.role === 'user'
                    ? 'bg-black text-white px-3 py-2 max-w-[85%] text-xs border-2 border-black'
                    : 'bg-gray-100 text-gray-900 px-3 py-2 max-w-[85%] text-xs border-2 border-black leading-relaxed'
                }>
                  {m.role === 'user'
                    ? m.content
                    : <span dangerouslySetInnerHTML={{ __html: renderMarkdown(m.content) }} />
                  }
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
