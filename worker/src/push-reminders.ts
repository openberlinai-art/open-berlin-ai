import type { Env } from './types'

export async function sendPushReminders(env: Env): Promise<{ sent: number }> {
  let sent = 0

  try {
    // Find attendance records with reminders due in next 30 min
    const { results: due } = await env.DB.prepare(`
      SELECT ua.user_id, ua.item_type, ua.item_id, ua.reminder_hours,
             e.title, e.date_start, e.time_start
      FROM user_attendance ua
      INNER JOIN events e ON ua.item_type = 'event' AND ua.item_id = e.id
      WHERE ua.reminder_hours IS NOT NULL
        AND ua.reminder_sent IS NULL
        AND datetime(e.date_start || 'T' || COALESCE(e.time_start, '00:00:00'), '-' || ua.reminder_hours || ' hours')
            BETWEEN datetime('now') AND datetime('now', '+30 minutes')
    `).all<{
      user_id: string; item_type: string; item_id: string; reminder_hours: number
      title: string; date_start: string; time_start: string | null
    }>()

    for (const record of due) {
      // Find push subscriptions for this user
      const { results: subs } = await env.DB.prepare(`
        SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?
      `).bind(record.user_id).all<{ endpoint: string; p256dh: string; auth: string }>()

      for (const sub of subs) {
        try {
          // Send web push notification (simplified — in production use VAPID signing)
          const payload = JSON.stringify({
            title: 'Event Reminder',
            body: `${record.title} starts ${record.reminder_hours === 1 ? 'in 1 hour' : `in ${record.reminder_hours} hours`}`,
            data: {
              url: `/events/${record.item_id}`,
              event_id: record.item_id,
            },
          })

          // Basic web push — requires VAPID keys to be set up
          // For now, use the simplified push API
          await fetch(sub.endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'TTL': '3600',
            },
            body: payload,
          })
          sent++
        } catch (err) {
          console.error(`[push-reminder] failed for endpoint ${sub.endpoint}:`, err)
        }
      }

      // Mark as sent
      await env.DB.prepare(`
        UPDATE user_attendance SET reminder_sent = 1
        WHERE user_id = ? AND item_type = ? AND item_id = ?
      `).bind(record.user_id, record.item_type, record.item_id).run()
    }
  } catch (err) {
    console.error('[push-reminders]', err)
  }

  return { sent }
}
