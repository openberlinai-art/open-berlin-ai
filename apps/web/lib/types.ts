export interface Event {
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

export interface OpeningHour {
  dayOfWeek:     string
  opens:         string
  closes:        string
  validFrom?:    string
  validThrough?: string
}

export interface Location {
  id:             string
  name:           string | null
  lat:            number | null
  lng:            number | null
  category:       string | null
  address:        string | null
  borough:        string | null
  website:        string | null
  tags:           string | null  // JSON array string
  description:    string | null
  phone:          string | null
  accessibility:  string | null  // JSON array of normalized codes
  opening_hours:  string | null  // JSON array of OpeningHour
  opening_status: string | null
  extra_links:    string | null  // JSON array of {url, displayName?}
  updated_at:     string
  events:         Pick<Event, 'id' | 'title' | 'date_start' | 'time_start' | 'category' | 'price_type'>[]
  pastEvents:     Pick<Event, 'id' | 'title' | 'date_start' | 'time_start' | 'category' | 'price_type'>[]
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
