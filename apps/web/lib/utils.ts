import { clsx, type ClassValue } from 'clsx'

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs)
}

const DAYS   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'] as const
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'] as const

/** Parse YYYY-MM-DD as local date (avoids UTC midnight shift) */
export function parseLocalDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y!, (m! - 1), d!)
}

export function formatDate(dateStr: string): string {
  const d = parseLocalDate(dateStr)
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`
}

export function formatTime(timeStr: string | null): string {
  if (!timeStr || timeStr === '00:00:00') return ''
  return timeStr.slice(0, 5)
}

export function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

// ─── Category colours ─────────────────────────────────────────────────────────

interface CategoryStyle {
  hex:   string
  bg:    string   // Tailwind bg
  text:  string   // Tailwind text
  badge: string   // bg + text combined
}

const CATEGORY_STYLES: Record<string, CategoryStyle> = {
  Exhibitions: { hex: '#6d28d9', bg: 'bg-violet-100',  text: 'text-violet-700', badge: 'bg-violet-100 text-violet-700' },
  Music:       { hex: '#2563eb', bg: 'bg-blue-100',    text: 'text-blue-700',   badge: 'bg-blue-100 text-blue-700'   },
  Dance:       { hex: '#ea580c', bg: 'bg-orange-100',  text: 'text-orange-700', badge: 'bg-orange-100 text-orange-700' },
  Recreation:  { hex: '#0d9488', bg: 'bg-teal-100',    text: 'text-teal-700',   badge: 'bg-teal-100 text-teal-700'   },
  Kids:        { hex: '#db2777', bg: 'bg-pink-100',    text: 'text-pink-700',   badge: 'bg-pink-100 text-pink-700'   },
  Sports:      { hex: '#65a30d', bg: 'bg-lime-100',    text: 'text-lime-700',   badge: 'bg-lime-100 text-lime-700'   },
  Tours:       { hex: '#0891b2', bg: 'bg-cyan-100',    text: 'text-cyan-700',   badge: 'bg-cyan-100 text-cyan-700'   },
  Film:        { hex: '#4b5563', bg: 'bg-gray-100',    text: 'text-gray-600',   badge: 'bg-gray-100 text-gray-600'   },
  Theater:     { hex: '#7c3aed', bg: 'bg-purple-100',  text: 'text-purple-700', badge: 'bg-purple-100 text-purple-700' },
  Talks:       { hex: '#4338ca', bg: 'bg-indigo-100',  text: 'text-indigo-700', badge: 'bg-indigo-100 text-indigo-700' },
  Education:   { hex: '#dc2626', bg: 'bg-red-100',     text: 'text-red-700',    badge: 'bg-red-100 text-red-700'     },
  Art:         { hex: '#b45309', bg: 'bg-amber-100',   text: 'text-amber-700',  badge: 'bg-amber-100 text-amber-700' },
}

const DEFAULT_STYLE: CategoryStyle = {
  hex: '#374151', bg: 'bg-gray-100', text: 'text-gray-600', badge: 'bg-gray-100 text-gray-600',
}

export function getCategoryStyle(category: string | null): CategoryStyle {
  if (!category) return DEFAULT_STYLE
  return CATEGORY_STYLES[category] ?? DEFAULT_STYLE
}

export function getCategoryHex(category: string | null): string {
  return getCategoryStyle(category).hex
}

export const ALL_CATEGORIES = Object.keys(CATEGORY_STYLES)
