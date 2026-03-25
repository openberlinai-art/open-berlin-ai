'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import { Send, X, MessageSquare, Plus, ChevronLeft } from 'lucide-react'

function renderMarkdown(raw: string): string {
  let s = raw
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>')
  s = s.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer" class="underline text-blue-600 hover:text-blue-800 break-all">$1</a>'
  )
  s = s.replace(
    /\[([^\]]+)\]\((\/(?:events|locations|pois|parks|playgrounds|community-events)\/[^\)]+)\)/g,
    '<a href="$2" class="underline text-blue-600 hover:text-blue-800">$1</a>'
  )
  s = s.replace(/^[*-] (.+)$/gm, '<span class="flex gap-1.5 mt-0.5"><span class="shrink-0">·</span><span>$1</span></span>')
  s = s.replace(/\n{2,}/g, '<br/><br/>')
  s = s.replace(/\n/g, '<br/>')
  return s
}

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface ConvoSummary {
  id: string
  title: string | null
  updated_at: string
}

interface Props {
  date: string
  viewport?: { lat: number; lng: number; zoom: number }
  token?: string | null
}

function getTimeAwarePrompts(): string[] {
  const h = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Berlin' })).getHours()
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Berlin' })).getDay()
  const isWeekend = d === 0 || d === 5 || d === 6

  if (h < 12) return [
    'What\'s happening today?',
    'Cafes open now in Kreuzberg',
    isWeekend ? 'Best events this weekend' : 'Exhibitions this week',
    'Free things to do today',
    'What\'s on this weekend?',
  ]
  if (h < 18) return [
    'Events tonight',
    'Free things this evening',
    isWeekend ? 'What\'s on tonight?' : 'Live music this week',
    'Anything interesting tomorrow?',
    'What\'s on this weekend?',
  ]
  return [
    'What\'s still on tonight?',
    'Late night options',
    'What\'s on tomorrow?',
    'Best events this weekend',
    'Live music this week',
  ]
}

export default function ChatPanel({ date, viewport, token }: Props) {
  const [open,     setOpen]     = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input,    setInput]    = useState('')
  const [loading,  setLoading]  = useState(false)
  const [convoId,  setConvoId]  = useState<string>(() => crypto.randomUUID())
  const [history,  setHistory]  = useState<ConvoSummary[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Load chat history list when panel opens
  const loadHistory = useCallback(async () => {
    if (!token) return
    try {
      const res = await fetch('/api/chat/history', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = await res.json() as { data: ConvoSummary[] }
        setHistory(data.data)
      }
    } catch { /* ignore */ }
  }, [token])

  useEffect(() => {
    if (open && token) loadHistory()
  }, [open, token, loadHistory])

  async function loadConversation(id: string) {
    if (!token) return
    try {
      const res = await fetch(`/api/chat/history/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = await res.json() as { data: { id: string; messages: Message[] } }
        setMessages(data.data.messages)
        setConvoId(id)
        setShowHistory(false)
      }
    } catch { /* ignore */ }
  }

  function newConversation() {
    setMessages([])
    setConvoId(crypto.randomUUID())
    setShowHistory(false)
  }

  async function send(overrideText?: string) {
    const text = (overrideText ?? input).trim()
    if (!text || loading) return
    setInput('')
    const next: Message[] = [...messages, { role: 'user', content: text }]
    setMessages(next)
    setLoading(true)
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (token) headers['Authorization'] = `Bearer ${token}`
      const res = await fetch('/api/chat', {
        method:  'POST',
        headers,
        body: JSON.stringify({ messages: next, date, viewport, conversation_id: token ? convoId : undefined }),
      })

      const contentType = res.headers.get('Content-Type') ?? ''

      if (contentType.includes('text/event-stream') && res.body) {
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

        // Save full conversation (with assistant response) via dedicated save endpoint
        if (token) {
          const fullMessages = [...next, { role: 'assistant' as const, content: assistantContent }]
          setMessages(fullMessages)
          fetch('/api/chat/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ conversation_id: convoId, messages: fullMessages }),
          }).catch(() => {})
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

  const suggestedPrompts = getTimeAwarePrompts()

  return (
    <>
      {/* FAB */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-20 right-5 sm:bottom-5 z-50 bg-[var(--accent)] text-[var(--accent-text)] p-3 border-2 border-[var(--border-primary)] shadow-[4px_4px_0_#555] hover:shadow-none hover:translate-x-1 hover:translate-y-1"
          aria-label="Open chat"
        >
          <MessageSquare size={20} />
        </button>
      )}

      {/* Panel */}
      {open && (
        <div className="fixed bottom-20 right-5 sm:bottom-5 z-50 w-80 max-h-[480px] flex flex-col bg-[var(--bg-primary)] border-2 border-[var(--border-primary)] shadow-[4px_4px_0_var(--border-primary)] overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2.5 border-b-2 border-[var(--border-primary)] bg-[var(--accent)] text-[var(--accent-text)]">
            <div className="flex items-center gap-2">
              {showHistory && (
                <button onClick={() => setShowHistory(false)} className="hover:opacity-70">
                  <ChevronLeft size={14} />
                </button>
              )}
              <span className="text-xs font-bold">{showHistory ? 'Chat History' : 'Ask about Berlin events'}</span>
            </div>
            <div className="flex items-center gap-1">
              {token && !showHistory && (
                <>
                  <button onClick={() => setShowHistory(true)} title="History" className="hover:opacity-70 p-0.5 text-[10px]">
                    History
                  </button>
                  <button onClick={newConversation} title="New chat" className="hover:opacity-70 p-0.5">
                    <Plus size={14} />
                  </button>
                </>
              )}
              <button onClick={() => setOpen(false)} className="hover:opacity-70 p-0.5">
                <X size={14} />
              </button>
            </div>
          </div>

          {/* History view */}
          {showHistory ? (
            <div className="flex-1 overflow-y-auto min-h-0">
              {history.length === 0 ? (
                <p className="text-[var(--text-muted)] text-xs text-center py-8">No conversations yet</p>
              ) : history.map(h => (
                <button
                  key={h.id}
                  onClick={() => loadConversation(h.id)}
                  className="w-full text-left px-3 py-2.5 border-b border-[var(--border-secondary)] hover:bg-[var(--bg-secondary)] transition-colors"
                >
                  <p className="text-xs font-medium text-[var(--text-primary)] truncate">{h.title ?? 'Untitled'}</p>
                  <p className="text-[9px] text-[var(--text-muted)]">{h.updated_at?.slice(0, 16)}</p>
                </button>
              ))}
            </div>
          ) : (
            <>
              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-3 space-y-2 text-sm min-h-0">
                {messages.length === 0 && (
                  <div className="mt-3 space-y-2">
                    <p className="text-[var(--text-muted)] text-[10px] text-center">Ask anything or try:</p>
                    <div className="flex flex-wrap gap-1.5 justify-center">
                      {suggestedPrompts.map(prompt => (
                        <button
                          key={prompt}
                          onClick={() => send(prompt)}
                          className="text-[10px] border border-[var(--border-secondary)] px-2 py-1 hover:border-[var(--border-primary)] hover:bg-[var(--bg-secondary)] transition-colors"
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
                        ? 'bg-[var(--accent)] text-[var(--accent-text)] px-3 py-2 max-w-[85%] text-xs border-2 border-[var(--border-primary)]'
                        : 'bg-[var(--bg-secondary)] text-[var(--text-primary)] px-3 py-2 max-w-[85%] text-xs border-2 border-[var(--border-primary)] leading-relaxed'
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
                    <div className="bg-[var(--bg-secondary)] text-[var(--text-muted)] px-3 py-2 text-xs border-2 border-[var(--border-secondary)]">
                      Thinking…
                    </div>
                  </div>
                )}
                <div ref={bottomRef} />
              </div>

              {/* Input */}
              <div className="flex items-center gap-2 px-3 py-2 border-t-2 border-[var(--border-primary)]">
                <input
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && send()}
                  placeholder="Ask about events…"
                  className="flex-1 text-xs border-2 border-[var(--border-primary)] px-3 py-2 outline-none focus:bg-[var(--bg-secondary)]"
                />
                <button
                  onClick={() => send()}
                  disabled={!input.trim() || loading}
                  className="p-2 bg-[var(--accent)] text-[var(--accent-text)] border-2 border-[var(--border-primary)] disabled:opacity-40 hover:bg-[var(--accent)]"
                >
                  <Send size={14} />
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </>
  )
}
