export interface Event {
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

export interface EventsResponse {
  data:       Event[]
  pagination: {
    total:       number
    page:        number
    limit:       number
    total_pages: number
  }
}

export interface EventFilters {
  date?:       string
  category?:   string
  price_type?: string
  page?:       number
  limit?:      number
}

export interface ChatMessage {
  role:    'user' | 'assistant'
  content: string
}
