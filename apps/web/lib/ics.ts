// ICS calendar file generation

interface ICSParams {
  title: string
  dateStart: string        // YYYY-MM-DD
  dateEnd?: string | null  // YYYY-MM-DD
  timeStart?: string | null // HH:MM or HH:MM:SS
  timeEnd?: string | null
  locationName?: string | null
  address?: string | null
  description?: string | null
}

function escapeICS(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n')
}

function formatICSDate(date: string, time?: string | null): string {
  const d = date.replace(/-/g, '')
  if (!time) return d
  const t = time.slice(0, 5).replace(':', '') + '00'
  return `${d}T${t}`
}

export function generateICS({
  title,
  dateStart,
  dateEnd,
  timeStart,
  timeEnd,
  locationName,
  address,
  description,
}: ICSParams): string {
  const hasTime = !!timeStart
  const dtStart = formatICSDate(dateStart, timeStart)
  const dtEnd = dateEnd
    ? formatICSDate(dateEnd, timeEnd ?? timeStart)
    : hasTime && timeEnd
      ? formatICSDate(dateStart, timeEnd)
      : formatICSDate(dateStart, timeStart)

  const location = [locationName, address].filter(Boolean).join(', ')
  const now = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Citizen.Berlin//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `DTSTAMP:${now}`,
    `UID:${dateStart}-${encodeURIComponent(title)}@citizen.berlin`,
    hasTime
      ? `DTSTART:${dtStart}`
      : `DTSTART;VALUE=DATE:${dtStart}`,
    hasTime || dateEnd
      ? (hasTime ? `DTEND:${dtEnd}` : `DTEND;VALUE=DATE:${dtEnd}`)
      : null,
    `SUMMARY:${escapeICS(title)}`,
    location ? `LOCATION:${escapeICS(location)}` : null,
    description ? `DESCRIPTION:${escapeICS(description)}` : null,
    'END:VEVENT',
    'END:VCALENDAR',
  ]

  return lines.filter(Boolean).join('\r\n')
}
