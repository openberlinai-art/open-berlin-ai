// ─── Cloudflare Env ───────────────────────────────────────────────────────────

export interface Env {
  DB:                  D1Database
  AI:                  Ai
  KULTURDATEN_API_URL: string
  ALLOWED_ORIGIN:      string
  INGEST_SECRET:       string
}

// ─── D1 Row ───────────────────────────────────────────────────────────────────

export interface EventRow {
  id:            string
  title:         string
  description:   string | null
  date_start:    string
  date_end:      string | null
  time_start:    string | null
  time_end:      string | null
  category:      string | null
  tags:          string | null   // JSON: string[]
  price_type:    'free' | 'paid' | 'unknown'
  price_min:     number | null
  price_max:     number | null
  location_name: string | null
  address:       string | null
  borough:       string | null
  lat:           number | null
  lng:           number | null
  source_url:    string | null
  attraction_id: string | null
  location_id:   string | null
  created_at:    string
  updated_at:    string
}

// ─── DB query options ─────────────────────────────────────────────────────────

export interface EventFilters {
  date?:       string
  category?:   string
  price_type?: string
  page?:       number
  limit?:      number
}

// ─── Kulturdaten API shapes ───────────────────────────────────────────────────

export interface KulturdatenEvent {
  identifier: string
  status:     string
  schedule: {
    startDate: string
    endDate:   string
    startTime: string
    endTime:   string
  }
  admission?: { ticketType: string; priceMin?: number; priceMax?: number }
  attractions: Array<{ referenceId: string; referenceLabel?: { de?: string; en?: string } }>
  locations:   Array<{ referenceId: string; referenceLabel?: { de?: string; en?: string } }>
}

export interface KulturdatenAttraction {
  identifier:  string
  title?:      { de?: string; en?: string }
  description?: { de?: string; en?: string }
  tags?:       string[]
  website?:    string
}

export interface KulturdatenLocation {
  identifier: string
  title?:     { de?: string; en?: string }
  address?: {
    streetAddress?: string
    postalCode?:    string
    addressLocality?: string
  }
  borough?:   string
  geo?: { latitude?: number; longitude?: number }
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
