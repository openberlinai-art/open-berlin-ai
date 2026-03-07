import { fetchEvents }     from '@/lib/api'
import { todayISO }        from '@/lib/utils'
import KulturPulseApp      from '@/components/KulturPulseApp'

export const revalidate = 300  // ISR: revalidate every 5 minutes

export default async function Page() {
  const today = todayISO()

  // Server-side prefetch — passes data to the client component as props
  const initial = await fetchEvents({ date: today, limit: 500 }).catch(() => ({
    data:       [],
    pagination: { total: 0, page: 1, limit: 500, total_pages: 0 },
  }))

  return (
    <KulturPulseApp
      initialEvents={initial.data}
      initialTotal={initial.pagination.total}
      initialDate={today}
    />
  )
}
