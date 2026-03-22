import type { Env } from './types'

export async function generateSmartNotifications(env: Env): Promise<{ sent: number }> {
  let sent = 0

  // 1. New events at venues user has attended
  try {
    const { results: venueNotifs } = await env.DB.prepare(`
      SELECT DISTINCT ua.user_id, e.id AS event_id, e.title AS event_title, l.name AS venue_name
      FROM user_attendance ua
      INNER JOIN events e ON e.location_id = ua.item_id AND e.date_start >= date('now') AND e.date_start <= date('now', '+3 days')
      INNER JOIN locations l ON l.id = ua.item_id
      WHERE ua.item_type = 'location'
        AND e.created_at >= datetime('now', '-1 day')
      LIMIT 100
    `).all<{ user_id: string; event_id: string; event_title: string; venue_name: string }>()

    for (const n of venueNotifs) {
      const id = crypto.randomUUID().replace(/-/g, '').slice(0, 32)
      await env.DB.prepare(`
        INSERT OR IGNORE INTO notifications (id, user_id, type, data)
        VALUES (?, ?, 'new_event_at_venue', ?)
      `).bind(id, n.user_id, JSON.stringify({
        event_title: n.event_title,
        event_id: n.event_id,
        venue_name: n.venue_name,
      })).run()
      sent++
    }
  } catch (err) {
    console.error('[smart-notifs:venue]', err)
  }

  // 2. Trending items in user's preferred boroughs
  try {
    const { results: users } = await env.DB.prepare(`
      SELECT id, preferences FROM users WHERE preferences IS NOT NULL
    `).all<{ id: string; preferences: string }>()

    for (const user of users) {
      try {
        const prefs = JSON.parse(user.preferences) as { boroughs?: string[] }
        if (!prefs.boroughs?.length) continue

        const placeholders = prefs.boroughs.map(() => '?').join(',')
        const { results: items } = await env.DB.prepare(`
          SELECT iv.item_id, iv.item_type, e.title, e.borough
          FROM item_views iv
          INNER JOIN events e ON iv.item_type = 'event' AND iv.item_id = e.id
          WHERE iv.view_date >= date('now', '-1 day')
            AND e.borough IN (${placeholders})
            AND e.date_start >= date('now')
          GROUP BY iv.item_id
          ORDER BY SUM(iv.count) DESC
          LIMIT 3
        `).bind(...prefs.boroughs).all<{ item_id: string; item_type: string; title: string; borough: string }>()

        if (items.length > 0) {
          const borough = items[0]!.borough
          const id = crypto.randomUUID().replace(/-/g, '').slice(0, 32)
          await env.DB.prepare(`
            INSERT OR IGNORE INTO notifications (id, user_id, type, data)
            VALUES (?, ?, 'trending_in_borough', ?)
          `).bind(id, user.id, JSON.stringify({
            borough,
            items: items.map(i => ({ title: i.title, item_id: i.item_id, item_type: i.item_type })),
          })).run()
          sent++
        }
      } catch { /* skip user */ }
    }
  } catch (err) {
    console.error('[smart-notifs:trending]', err)
  }

  // 3. Event tomorrow reminder for attended events
  try {
    const { results: reminders } = await env.DB.prepare(`
      SELECT ua.user_id, e.id AS event_id, e.title AS event_title, e.time_start
      FROM user_attendance ua
      INNER JOIN events e ON ua.item_type = 'event' AND ua.item_id = e.id
      WHERE e.date_start = date('now', '+1 day')
      LIMIT 100
    `).all<{ user_id: string; event_id: string; event_title: string; time_start: string | null }>()

    for (const r of reminders) {
      const id = crypto.randomUUID().replace(/-/g, '').slice(0, 32)
      await env.DB.prepare(`
        INSERT OR IGNORE INTO notifications (id, user_id, type, data)
        VALUES (?, ?, 'event_tomorrow', ?)
      `).bind(id, r.user_id, JSON.stringify({
        event_title: r.event_title,
        event_id: r.event_id,
        time_start: r.time_start,
      })).run()
      sent++
    }
  } catch (err) {
    console.error('[smart-notifs:tomorrow]', err)
  }

  return { sent }
}
