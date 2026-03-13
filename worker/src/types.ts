// ─── Cloudflare Env ───────────────────────────────────────────────────────────

export interface Env {
  DB:                  D1Database
  AI:                  Ai
  GEODATA:             R2Bucket
  KULTURDATEN_API_URL: string
  ALLOWED_ORIGIN:      string
  INGEST_SECRET:       string
  RESEND_API_KEY:      string
  JWT_SECRET:          string
  FRONTEND_URL:        string
}

// ─── D1 Row ───────────────────────────────────────────────────────────────────

export interface EventRow {
  id:              string
  title:           string
  description:     string | null
  date_start:      string
  date_end:        string | null
  time_start:      string | null
  time_end:        string | null
  door_time:       string | null
  category:        string | null
  tags:            string | null   // JSON: string[]
  price_type:      'free' | 'paid' | 'unknown'
  price_min:       number | null
  price_max:       number | null
  admission_link:  string | null
  location_name:   string | null
  address:         string | null
  borough:         string | null
  lat:             number | null
  lng:             number | null
  source_url:      string | null
  attraction_id:   string | null
  location_id:     string | null
  schedule_status: string | null  // 'cancelled'|'postponed'|'rescheduled'|'scheduled'
  please_note:     string | null
  created_at:      string
  updated_at:      string
}

// ─── DB query options ─────────────────────────────────────────────────────────

export interface EventFilters {
  date?:       string
  category?:   string
  price_type?: string
  bbox?:       string   // 'minLng,minLat,maxLng,maxLat'
  page?:       number
  limit?:      number
}

// ─── Kulturdaten API shapes ───────────────────────────────────────────────────

export interface KulturdatenEvent {
  identifier:     string
  status:         string
  scheduleStatus?: string  // 'event.cancelled'|'event.postponed'|'event.rescheduled'|'event.scheduled'
  schedule: {
    startDate:  string
    endDate:    string
    startTime:  string
    endTime:    string
    doorTime?:  string
  }
  admission?: {
    ticketType:        string
    priceMin?:         number
    priceMax?:         number
    admissionLink?:    string
    registrationType?: string
    note?:             { de?: string; en?: string }
  }
  pleaseNote?:  { de?: string; en?: string }
  attractions: Array<{ referenceId: string; referenceLabel?: { de?: string; en?: string } }>
  locations:   Array<{ referenceId: string; referenceLabel?: { de?: string; en?: string } }>
}

export interface KulturdatenAttraction {
  identifier:   string
  title?:       { de?: string; en?: string }
  description?: { de?: string; en?: string }
  pleaseNote?:  { de?: string; en?: string }
  tags?:        string[]
  website?:     string
  externalLinks?: Array<{ url: string; displayName?: string }>
}

export interface KulturdatenOpeningHour {
  dayOfWeek:     string   // e.g. "Monday"
  opens:         string   // HH:MM
  closes:        string   // HH:MM
  validFrom?:    string
  validThrough?: string
}

export interface KulturdatenLocation {
  identifier:    string
  title?:        { de?: string; en?: string }
  description?:  { de?: string; en?: string }
  address?: {
    streetAddress?:   string
    postalCode?:      string
    addressLocality?: string
  }
  borough?:        string
  geo?: { latitude?: number; longitude?: number }
  tags?:           string[]
  website?:        string
  contact?: {
    name?:      string
    telephone?: string
    email?:     string
  }
  accessibility?:  string[]
  openingHours?:   KulturdatenOpeningHour[]
  openingStatus?:  string   // 'location.opened'|'location.closed'|'location.permanentlyClosed'
  externalLinks?:  Array<{ url: string; displayName?: string }>
  isVirtual?:      boolean
}

// ─── Chat ─────────────────────────────────────────────────────────────────────

export interface ChatMessage {
  role:    'user' | 'assistant' | 'system'
  content: string
}

export interface ChatRequest {
  message:  string
  history?: ChatMessage[]
}
