import { upsertEvents } from './db'
import type { Env, EventRow } from './types'

// Berlin teams we track across leagues
const BERLIN_TEAMS: Record<number, { name: string; venue: string; lat: number; lng: number }> = {
  80:  { name: '1. FC Union Berlin', venue: 'Stadion An der Alten Försterei', lat: 52.4572, lng: 13.5681 },
  54:  { name: 'Hertha BSC',         venue: 'Olympiastadion Berlin',         lat: 52.5147, lng: 13.2395 },
  641: { name: 'Eisbären Berlin',     venue: 'Uber Arena',                   lat: 52.5075, lng: 13.4434 },
}

// Leagues to poll (shortcut → display name)
const LEAGUES: Record<string, string> = {
  bl1: '1. Bundesliga',
  bl2: '2. Bundesliga',
  bl3: '3. Liga',
  dfb: 'DFB Pokal',
  del: 'DEL',
}

interface OlMatch {
  matchID: number
  matchDateTime: string
  matchIsFinished: boolean
  team1: { teamId: number; teamName: string; shortName?: string }
  team2: { teamId: number; teamName: string; shortName?: string }
  matchResults?: Array<{ pointsTeam1: number; pointsTeam2: number; resultOrderID: number }>
  leagueName?: string
  leagueShortcut?: string
}

function isBerlinMatch(m: OlMatch): { teamId: number; isHome: boolean } | null {
  for (const id of Object.keys(BERLIN_TEAMS).map(Number)) {
    if (m.team1.teamId === id) return { teamId: id, isHome: true }
    if (m.team2.teamId === id) return { teamId: id, isHome: false }
  }
  return null
}

function transformMatch(m: OlMatch, league: string): Omit<EventRow, 'created_at' | 'updated_at'> | null {
  const berlin = isBerlinMatch(m)
  if (!berlin) return null

  const team = BERLIN_TEAMS[berlin.teamId]
  if (!team) return null

  // Parse date
  const dt = new Date(m.matchDateTime)
  if (isNaN(dt.getTime())) return null

  const dateStr = dt.toISOString().slice(0, 10)
  const timeStr = dt.toISOString().slice(11, 16)

  const title = `${m.team1.teamName} vs ${m.team2.teamName}`
  const leagueName = LEAGUES[league] ?? m.leagueName ?? league

  // Only use Berlin venue coords for home games
  const lat = berlin.isHome ? team.lat : null
  const lng = berlin.isHome ? team.lng : null
  const venue = berlin.isHome ? team.venue : null

  // Skip away games (no Berlin venue)
  if (!berlin.isHome) return null

  const schedule_status = m.matchIsFinished ? null : null // could track postponements if API provides

  return {
    id:               `ol:${m.matchID}`,
    title,
    description:      `${leagueName} — ${title}`,
    date_start:       dateStr,
    date_end:         null,
    time_start:       timeStr,
    time_end:         null,
    door_time:        null,
    category:         'Sports',
    tags:             JSON.stringify([leagueName, league === 'del' ? 'Ice Hockey' : 'Football']),
    price_type:       'paid',
    price_min:        null,
    price_max:        null,
    admission_link:   null,
    location_name:    venue,
    address:          'Berlin',
    borough:          null,
    lat,
    lng,
    source_url:       `https://www.openligadb.de/match/${m.matchID}`,
    attraction_id:    null,
    location_id:      null,
    schedule_status,
    please_note:      null,
    admission_note:   null,
    source_links:     null,
    registration_type: null,
    languages:        JSON.stringify(['de']),
    image_urls:       null,
  }
}

export async function ingestOpenLigaDB(env: Env): Promise<number> {
  console.log('[ingest:openligadb] Starting')

  const allEvents: Array<Omit<EventRow, 'created_at' | 'updated_at'>> = []

  for (const league of Object.keys(LEAGUES)) {
    try {
      const res = await fetch(`https://api.openligadb.de/getmatchdata/${league}`)
      if (!res.ok) {
        console.warn(`[ingest:openligadb] ${league} API error ${res.status}`)
        continue
      }
      const matches = await res.json() as OlMatch[]
      if (!Array.isArray(matches)) continue

      for (const m of matches) {
        if (m.matchIsFinished) continue
        const row = transformMatch(m, league)
        if (row) allEvents.push(row)
      }

      // Also fetch next matchday for this league
      try {
        const nextRes = await fetch(`https://api.openligadb.de/getmatchdata/${league}/${new Date().getFullYear()}/${getNextMatchday(matches)}`)
        if (nextRes.ok) {
          const nextMatches = await nextRes.json() as OlMatch[]
          if (Array.isArray(nextMatches)) {
            for (const m of nextMatches) {
              if (m.matchIsFinished) continue
              const row = transformMatch(m, league)
              if (row && !allEvents.some(e => e.id === row.id)) allEvents.push(row)
            }
          }
        }
      } catch { /* next matchday fetch is best-effort */ }
    } catch (err) {
      console.warn(`[ingest:openligadb] ${league} fetch error:`, err)
    }

    await new Promise(r => setTimeout(r, 300))
  }

  console.log(`[ingest:openligadb] Found ${allEvents.length} upcoming Berlin home games`)

  if (allEvents.length) {
    try {
      await upsertEvents(env.DB, allEvents)
    } catch (err) {
      console.warn('[ingest:openligadb] Upsert failed:', err)
      return 0
    }
  }

  console.log(`[ingest:openligadb] Done — ${allEvents.length} events`)
  return allEvents.length
}

function getNextMatchday(matches: OlMatch[]): number {
  // Find the current matchday group number and return +1
  const groupIds = matches
    .map(m => (m as unknown as Record<string, unknown>).group as { groupOrderID?: number } | undefined)
    .filter(Boolean)
    .map(g => g!.groupOrderID ?? 0)
  const max = Math.max(...groupIds, 0)
  return max + 1
}
