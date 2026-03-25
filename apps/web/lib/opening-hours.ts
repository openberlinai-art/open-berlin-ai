import type { OpeningHour } from './types'

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const OSM_DAY_MAP: Record<string, number> = {
  Su: 0, Mo: 1, Tu: 2, We: 3, Th: 4, Fr: 5, Sa: 6,
}

function nowInBerlin(): { dayIndex: number; hhmm: string } {
  const now = new Date()
  const berlin = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Berlin',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now)

  const weekday = berlin.find(p => p.type === 'weekday')?.value ?? ''
  const hour = berlin.find(p => p.type === 'hour')?.value ?? '00'
  const minute = berlin.find(p => p.type === 'minute')?.value ?? '00'

  const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  return { dayIndex: dayMap[weekday] ?? 0, hhmm: `${hour}:${minute}` }
}

/** Parse Kulturdaten JSON opening hours */
function checkJsonHours(json: string): 'open' | 'closed' | 'unknown' {
  let hours: OpeningHour[]
  try { hours = JSON.parse(json) } catch { return 'unknown' }
  if (!hours.length) return 'unknown'

  const { dayIndex, hhmm } = nowInBerlin()
  const todayName = DAY_NAMES[dayIndex]

  for (const h of hours) {
    if (h.dayOfWeek === todayName && hhmm >= h.opens && hhmm < h.closes) {
      return 'open'
    }
  }
  return 'closed'
}

/** Parse OSM-format opening hours string like "Mo-Fr 09:00-18:00; Sa 10:00-14:00" */
function checkOsmHours(raw: string): 'open' | 'closed' | 'unknown' {
  const { dayIndex, hhmm } = nowInBerlin()

  // Handle "24/7"
  if (raw.trim() === '24/7') return 'open'

  const parts = raw.split(';').map(s => s.trim())
  for (const part of parts) {
    // Match patterns like "Mo-Fr 09:00-18:00" or "Sa 10:00-14:00" or "Mo,We,Fr 08:00-16:00"
    const match = part.match(/^([A-Za-z, -]+?)\s+(\d{2}:\d{2})-(\d{2}:\d{2})/)
    if (!match) continue

    const [, daysPart, opens, closes] = match
    const dayIndices = parseDayRange(daysPart!)
    if (dayIndices.includes(dayIndex) && hhmm >= opens! && hhmm < closes!) {
      return 'open'
    }
  }
  return 'closed'
}

function parseDayRange(daysPart: string): number[] {
  const indices: number[] = []
  const segments = daysPart.split(',').map(s => s.trim())
  for (const seg of segments) {
    if (seg.includes('-')) {
      const [start, end] = seg.split('-').map(d => OSM_DAY_MAP[d.trim()])
      if (start != null && end != null) {
        let i = start
        while (true) {
          indices.push(i)
          if (i === end) break
          i = (i + 1) % 7
        }
      }
    } else {
      const d = OSM_DAY_MAP[seg.trim()]
      if (d != null) indices.push(d)
    }
  }
  return indices
}

/**
 * Determine if a venue is currently open.
 * Accepts either JSON array (Kulturdaten) or OSM string format.
 */
export function isOpenNow(openingHours: string | null | undefined): 'open' | 'closed' | 'unknown' {
  if (!openingHours) return 'unknown'
  const trimmed = openingHours.trim()
  if (!trimmed) return 'unknown'

  // JSON array format (starts with '[')
  if (trimmed.startsWith('[')) {
    return checkJsonHours(trimmed)
  }
  // OSM string format
  return checkOsmHours(trimmed)
}
