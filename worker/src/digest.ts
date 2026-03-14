import type { Env } from './types'

export async function sendWeeklyDigest(env: Env): Promise<void> {
  // Fetch opted-in users
  const { results: users } = await env.DB
    .prepare(`SELECT id, email FROM users WHERE digest_opt_in = 1`)
    .all<{ id: string; email: string }>()

  if (users.length === 0) {
    console.log('[digest] no opted-in users')
    return
  }

  // Fetch upcoming events for the next 7 days, diverse categories
  const today = new Date()
  const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000)
  const dateFrom = today.toISOString().slice(0, 10)
  const dateTo   = nextWeek.toISOString().slice(0, 10)

  const { results: events } = await env.DB
    .prepare(`
      SELECT title, date_start, time_start, category, price_type,
             location_name, borough, admission_link, source_url
      FROM events
      WHERE date_start >= ? AND date_start <= ?
        AND schedule_status IS NOT 'cancelled'
      GROUP BY category, date_start
      ORDER BY category ASC, date_start ASC
      LIMIT 12
    `)
    .bind(dateFrom, dateTo)
    .all<{
      title: string
      date_start: string
      time_start: string | null
      category: string | null
      price_type: string
      location_name: string | null
      borough: string | null
      admission_link: string | null
      source_url: string | null
    }>()

  if (events.length === 0) {
    console.log('[digest] no upcoming events found')
    return
  }

  // Group events by date
  const byDate = new Map<string, typeof events>()
  for (const ev of events) {
    const list = byDate.get(ev.date_start) ?? []
    list.push(ev)
    byDate.set(ev.date_start, list)
  }

  const frontendUrl = env.FRONTEND_URL || 'https://kulturpulse.berlin'

  // Build HTML
  const formatDate = (d: string) => {
    const date = new Date(d + 'T00:00:00')
    return date.toLocaleDateString('en-DE', { weekday: 'long', month: 'long', day: 'numeric' })
  }

  let eventsHtml = ''
  for (const [date, evs] of byDate) {
    eventsHtml += `
      <tr><td colspan="2" style="padding:16px 0 6px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#6b7280;border-top:1px solid #e5e7eb;">
        ${formatDate(date)}
      </td></tr>`
    for (const ev of evs) {
      const link = ev.admission_link ?? ev.source_url ?? frontendUrl
      const time = ev.time_start ? ev.time_start.slice(0, 5) + ' · ' : ''
      const venue = ev.location_name ? ` · ${ev.location_name}` : ''
      const price = ev.price_type === 'free' ? ' · Free' : ''
      eventsHtml += `
      <tr>
        <td style="padding:6px 0;vertical-align:top;">
          <a href="${link}" style="font-size:14px;font-weight:700;color:#111827;text-decoration:none;">${ev.title}</a>
          <br>
          <span style="font-size:12px;color:#6b7280;">${time}${ev.category ?? ''}${venue}${price}</span>
        </td>
      </tr>`
    }
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:32px 16px;">
    <tr><td>
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#fff;border:2px solid #000;padding:32px;">
        <tr>
          <td style="padding-bottom:24px;border-bottom:2px solid #000;">
            <span style="font-size:20px;font-weight:800;letter-spacing:-0.02em;">KulturPulse</span>
            <span style="font-size:12px;color:#6b7280;display:block;margin-top:2px;">Berlin culture events · Weekly digest</span>
          </td>
        </tr>
        <tr><td style="padding:16px 0 8px;font-size:13px;color:#374151;">
          Here are the top Berlin culture events for the week of <strong>${formatDate(dateFrom)}</strong>:
        </td></tr>
        <tr><td>
          <table width="100%" cellpadding="0" cellspacing="0">
            ${eventsHtml}
          </table>
        </td></tr>
        <tr>
          <td style="padding-top:24px;border-top:1px solid #e5e7eb;font-size:11px;color:#9ca3af;">
            <a href="${frontendUrl}" style="color:#000;font-weight:700;text-decoration:none;">View all events →</a>
            &nbsp;·&nbsp;
            You're receiving this because you opted in. To unsubscribe, visit your account settings.
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`

  // Send to all opted-in users
  let sent = 0
  for (const user of users) {
    try {
      const res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method:  'POST',
        headers: {
          'api-key':      env.BREVO_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sender:      { name: 'KulturPulse', email: env.BREVO_SENDER_EMAIL },
          to:          [{ email: user.email }],
          subject:     `Your weekly Berlin culture digest · ${formatDate(dateFrom)}`,
          htmlContent: html,
        }),
      })
      if (res.ok) sent++
      else console.error(`[digest] Brevo error for ${user.email}: ${res.status}`)
    } catch (err) {
      console.error(`[digest] failed for ${user.email}:`, err)
    }
  }

  console.log(`[digest] sent ${sent}/${users.length} digests`)
}
