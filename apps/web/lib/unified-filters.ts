// Unified filter system — replaces 3 separate filter sections with 13 groups
// Each subcategory key is globally unique: "groupKey:categoryKey"

import type { LucideIcon } from 'lucide-react'
import {
  Castle, Milestone, Church, Camera, TreePine, Train,
  UtensilsCrossed, Dumbbell, Building2, Wine, ShoppingBag, Bed,
  Palette,
} from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────────────

export type DataSource = 'venue' | 'osm' | 'poi' | 'geodata'

export interface UnifiedCategory {
  key:       string   // unique within group, e.g. "museum"
  label:     string
  color:     string
  stroke:    string
  source:    DataSource
  sourceKey: string   // key used to fetch data from that source
}

export interface UnifiedGroup {
  key:        string
  label:      string
  icon:       LucideIcon
  categories: UnifiedCategory[]
  poiGroup?:  string   // if this maps to a POI API group
}

// ─── Resolved result from activeFilters ──────────────────────────────────────

export interface ResolvedFilters {
  venueCategories: string[]
  osmCategories:   string[]
  poiGroups:       Map<string, Set<string>>
  geodataLayers:   Set<string>
}

// ─── Helper to create subcategory ────────────────────────────────────────────

function vc(key: string, label: string, color: string, stroke: string, source: DataSource, sourceKey: string): UnifiedCategory {
  return { key, label, color, stroke, source, sourceKey }
}

// ─── 13 Filter Groups ───────────────────────────────────────────────────────

export const FILTER_GROUPS: UnifiedGroup[] = [
  // 1. Culture — D1 locations + OSM street_art
  {
    key: 'culture', label: 'Culture', icon: Palette,
    categories: [
      vc('museum',           'Museums',       '#b91c1c', '#7f1d1d', 'venue', 'museum'),
      vc('gallery',          'Galleries',     '#7c3aed', '#4c1d95', 'venue', 'gallery'),
      vc('theatre',          'Theatres',      '#0369a1', '#075985', 'venue', 'theatre'),
      vc('concert_hall',     'Concert Halls', '#b45309', '#78350f', 'venue', 'concert_hall'),
      vc('cinema',           'Cinemas',       '#0891b2', '#164e63', 'venue', 'cinema'),
      vc('library',          'Libraries',     '#0369a1', '#0c4a6e', 'venue', 'library'),
      vc('community_centre', 'Community',     '#15803d', '#14532d', 'venue', 'community_centre'),
      vc('street_art',       'Street Art',    '#e879f9', '#a21caf', 'osm',   'street_art'),
      vc('culture_other',    'Other',         '#6b7280', '#4b5563', 'venue', 'other'),
    ],
  },

  // 2. Nightlife — OSM live_music/jazz/clubs + POI nightlife
  {
    key: 'nightlife', label: 'Nightlife', icon: Wine, poiGroup: 'nightlife',
    categories: [
      vc('live_music',    'Live Music',     '#1d4ed8', '#1e3a8a', 'osm', 'live_music'),
      vc('jazz',          'Jazz',           '#92400e', '#451a03', 'osm', 'jazz'),
      vc('clubs',         'Clubs',          '#7c3aed', '#4c1d95', 'osm', 'clubs'),
      vc('bar',           'Bars',           '#dc2626', '#b91c1c', 'poi', 'bar'),
      vc('pub',           'Pubs',           '#b45309', '#92400e', 'poi', 'pub'),
      vc('wine_bar',      'Wine Bars',      '#9f1239', '#881337', 'poi', 'wine_bar'),
      vc('hookah_lounge', 'Hookah Lounges', '#6b7280', '#4b5563', 'poi', 'hookah_lounge'),
      vc('nightclub',     'Nightclubs',     '#9333ea', '#7e22ce', 'poi', 'nightclub'),
    ],
  },

  // 3. Food & Drink — POI food_drink
  {
    key: 'food_drink', label: 'Food & Drink', icon: UtensilsCrossed, poiGroup: 'food_drink',
    categories: [
      vc('restaurant',  'Restaurants',  '#dc2626', '#b91c1c', 'poi', 'restaurant'),
      vc('cafe',        'Cafes',        '#b45309', '#92400e', 'poi', 'cafe'),
      vc('beer_garden', 'Beer Gardens', '#ca8a04', '#a16207', 'poi', 'beer_garden'),
      vc('market',      'Markets',      '#65a30d', '#4d7c0f', 'poi', 'market'),
      vc('bakery',      'Bakeries',     '#d97706', '#b45309', 'poi', 'bakery'),
      vc('ice_cream',   'Ice Cream',    '#ec4899', '#db2777', 'poi', 'ice_cream'),
      vc('fast_food',   'Fast Food',    '#ea580c', '#c2410c', 'poi', 'fast_food'),
      vc('food_court',  'Food Courts',  '#d97706', '#b45309', 'poi', 'food_court'),
    ],
  },

  // 4. Outdoors — geodata parks/playgrounds + POI nature + some POI sports
  {
    key: 'outdoors', label: 'Outdoors', icon: TreePine,
    categories: [
      vc('parks',            'Parks',         '#16a34a', '#14532d', 'geodata', 'parks'),
      vc('playgrounds',      'Playgrounds',   '#e879f9', '#86198f', 'geodata', 'playgrounds'),
      vc('lake',             'Lakes',         '#0284c7', '#0369a1', 'poi',     'lake'),
      vc('beach',            'Beaches',       '#eab308', '#ca8a04', 'poi',     'beach'),
      vc('forest',           'Forests',       '#15803d', '#166534', 'poi',     'forest'),
      vc('nature_reserve',   'Reserves',      '#16a34a', '#15803d', 'poi',     'nature_reserve'),
      vc('garden',           'Gardens',       '#65a30d', '#4d7c0f', 'poi',     'garden'),
      vc('cemetery_park',    'Cemeteries',    '#6b7280', '#4b5563', 'poi',     'cemetery_park'),
      vc('allotment_garden', 'Kleingarten',   '#4d7c0f', '#365314', 'poi',     'allotment_garden'),
      vc('pond',             'Ponds',         '#0284c7', '#0369a1', 'poi',     'pond'),
      vc('dog_park',         'Dog Parks',     '#65a30d', '#4d7c0f', 'poi',     'dog_park'),
      vc('skatepark',        'Skateparks',    '#6366f1', '#4f46e5', 'poi',     'skatepark'),
      vc('playground_poi',   'Playgrounds (POI)', '#f59e0b', '#d97706', 'poi', 'playground'),
    ],
  },

  // 5. Heritage — POI heritage
  {
    key: 'heritage', label: 'Heritage', icon: Castle, poiGroup: 'heritage',
    categories: [
      vc('castle',              'Castles',        '#854d0e', '#713f12', 'poi', 'castle'),
      vc('palace',              'Palaces',        '#a16207', '#854d0e', 'poi', 'palace'),
      vc('manor',               'Manors',         '#b45309', '#92400e', 'poi', 'manor'),
      vc('historic_house',      'Historic Houses','#c2410c', '#9a3412', 'poi', 'historic_house'),
      vc('ruins',               'Ruins',          '#78716c', '#57534e', 'poi', 'ruins'),
      vc('archaeological_site', 'Archaeological', '#92400e', '#78350f', 'poi', 'archaeological_site'),
      vc('city_gate',           'City Gates',     '#a16207', '#854d0e', 'poi', 'city_gate'),
      vc('bunker',              'Bunkers',        '#525252', '#404040', 'poi', 'bunker'),
      vc('berlin_wall',         'Berlin Wall',    '#475569', '#334155', 'poi', 'berlin_wall'),
      vc('windmill',            'Windmills',      '#65a30d', '#4d7c0f', 'poi', 'windmill'),
    ],
  },

  // 6. Monuments — POI monuments
  {
    key: 'monuments', label: 'Monuments', icon: Milestone, poiGroup: 'monuments',
    categories: [
      vc('monument',     'Monuments',     '#b91c1c', '#991b1b', 'poi', 'monument'),
      vc('memorial',     'Memorials',     '#9f1239', '#881337', 'poi', 'memorial'),
      vc('war_memorial', 'War Memorials', '#6b7280', '#4b5563', 'poi', 'war_memorial'),
      vc('statue',       'Statues',       '#7c3aed', '#6d28d9', 'poi', 'statue'),
      vc('fountain',     'Fountains',     '#0284c7', '#0369a1', 'poi', 'fountain'),
      vc('artwork',      'Public Art',    '#e879f9', '#d946ef', 'poi', 'artwork'),
    ],
  },

  // 7. Worship — POI worship
  {
    key: 'worship', label: 'Worship', icon: Church, poiGroup: 'worship',
    categories: [
      vc('church',    'Churches',    '#a16207', '#854d0e', 'poi', 'church'),
      vc('cathedral', 'Cathedrals',  '#854d0e', '#713f12', 'poi', 'cathedral'),
      vc('synagogue', 'Synagogues',  '#1d4ed8', '#1e40af', 'poi', 'synagogue'),
      vc('mosque',    'Mosques',     '#059669', '#047857', 'poi', 'mosque'),
      vc('chapel',    'Chapels',     '#b45309', '#92400e', 'poi', 'chapel'),
    ],
  },

  // 8. Transport — POI transport
  {
    key: 'transport', label: 'Transport', icon: Train, poiGroup: 'transport',
    categories: [
      vc('sbahn',       'S-Bahn',      '#16a34a', '#15803d', 'poi', 'sbahn'),
      vc('ubahn',       'U-Bahn',      '#2563eb', '#1d4ed8', 'poi', 'ubahn'),
      vc('bike_rental', 'Bike Rental', '#ea580c', '#c2410c', 'poi', 'bike_rental'),
      vc('ev_charging', 'EV Charging', '#0891b2', '#0e7490', 'poi', 'ev_charging'),
      vc('ferry',       'Ferries',     '#0369a1', '#075985', 'poi', 'ferry'),
      vc('parking',     'Parking',     '#6b7280', '#4b5563', 'poi', 'parking'),
      vc('tram_stop',   'Tram Stops',  '#dc2626', '#b91c1c', 'poi', 'tram_stop'),
      vc('car_sharing', 'Car Sharing', '#059669', '#047857', 'poi', 'car_sharing'),
    ],
  },

  // 9. Shopping — POI shopping
  {
    key: 'shopping', label: 'Shopping', icon: ShoppingBag, poiGroup: 'shopping',
    categories: [
      vc('supermarket',  'Supermarkets', '#16a34a', '#15803d', 'poi', 'supermarket'),
      vc('flea_market',  'Flea Markets', '#d97706', '#b45309', 'poi', 'flea_market'),
      vc('mall',         'Malls',        '#7c3aed', '#6d28d9', 'poi', 'mall'),
      vc('bookshop',     'Bookshops',    '#0369a1', '#075985', 'poi', 'bookshop'),
      vc('record_shop',  'Record Shops', '#7c3aed', '#4c1d95', 'poi', 'record_shop'),
      vc('vintage_shop', 'Vintage',      '#d97706', '#92400e', 'poi', 'vintage_shop'),
      vc('convenience',  'Convenience',  '#059669', '#047857', 'poi', 'convenience'),
      vc('florist',      'Florists',     '#ec4899', '#db2777', 'poi', 'florist'),
      vc('bicycle_shop', 'Bike Shops',   '#15803d', '#14532d', 'poi', 'bicycle_shop'),
    ],
  },

  // 10. Sports — POI sports (minus playground, skatepark, dog_park → moved to Outdoors)
  {
    key: 'sports', label: 'Sports', icon: Dumbbell, poiGroup: 'sports',
    categories: [
      vc('gym',           'Gyms',           '#dc2626', '#b91c1c', 'poi', 'gym'),
      vc('pool',          'Pools',          '#0284c7', '#0369a1', 'poi', 'pool'),
      vc('climbing',      'Climbing',       '#ea580c', '#c2410c', 'poi', 'climbing'),
      vc('sports_centre', 'Sports Centres', '#16a34a', '#15803d', 'poi', 'sports_centre'),
      vc('boat_rental',   'Boat Rental',    '#0891b2', '#0e7490', 'poi', 'boat_rental'),
      vc('stadium',       'Stadiums',       '#7c3aed', '#6d28d9', 'poi', 'stadium'),
    ],
  },

  // 11. Tourism — POI tourism (minus osm_museum, osm_gallery, osm_cinema → moved to Culture)
  {
    key: 'tourism', label: 'Tourism', icon: Camera, poiGroup: 'tourism',
    categories: [
      vc('sight',             'Sights',      '#dc2626', '#b91c1c', 'poi', 'sight'),
      vc('viewpoint',         'Viewpoints',  '#16a34a', '#15803d', 'poi', 'viewpoint'),
      vc('observation_tower', 'Towers',      '#7c3aed', '#6d28d9', 'poi', 'observation_tower'),
      vc('information',       'Info Points', '#2563eb', '#1d4ed8', 'poi', 'information'),
      vc('zoo',               'Zoos',        '#ca8a04', '#a16207', 'poi', 'zoo'),
      vc('aquarium',          'Aquariums',   '#0891b2', '#0e7490', 'poi', 'aquarium'),
      vc('theme_park',        'Theme Parks', '#e11d48', '#be123c', 'poi', 'theme_park'),
    ],
  },

  // 12. Services — POI services
  {
    key: 'services', label: 'Services', icon: Building2, poiGroup: 'services',
    categories: [
      vc('pharmacy',      'Pharmacies',   '#dc2626', '#b91c1c', 'poi', 'pharmacy'),
      vc('post_office',   'Post Offices', '#eab308', '#ca8a04', 'poi', 'post_office'),
      vc('hospital',      'Hospitals',    '#e11d48', '#be123c', 'poi', 'hospital'),
      vc('embassy',       'Embassies',    '#1d4ed8', '#1e40af', 'poi', 'embassy'),
      vc('public_toilet', 'Toilets',      '#6b7280', '#4b5563', 'poi', 'public_toilet'),
      vc('library_poi',   'Libraries',    '#0369a1', '#075985', 'poi', 'library'),
      vc('coworking',     'Coworking',    '#7c3aed', '#6d28d9', 'poi', 'coworking'),
      vc('dentist',       'Dentists',     '#0891b2', '#0e7490', 'poi', 'dentist'),
      vc('doctor',        'Doctors',      '#0284c7', '#0369a1', 'poi', 'doctor'),
      vc('police',        'Police',       '#1d4ed8', '#1e40af', 'poi', 'police'),
    ],
  },

  // 13. Accommodation — POI accommodation
  {
    key: 'accommodation', label: 'Accommodation', icon: Bed, poiGroup: 'accommodation',
    categories: [
      vc('hotel',       'Hotels',       '#7c3aed', '#6d28d9', 'poi', 'hotel'),
      vc('hostel',      'Hostels',      '#2563eb', '#1d4ed8', 'poi', 'hostel'),
      vc('campsite',    'Campsites',    '#16a34a', '#15803d', 'poi', 'campsite'),
      vc('apartment',   'Apartments',   '#ea580c', '#c2410c', 'poi', 'apartment'),
      vc('guest_house', 'Guest Houses', '#0891b2', '#0e7490', 'poi', 'guest_house'),
    ],
  },
]

// ─── Default active filters: all culture subcategories ───────────────────────

export const CULTURE_DEFAULTS: Set<string> = new Set(
  FILTER_GROUPS[0].categories.map(c => `culture:${c.key}`)
)

// ─── Lookup maps (built once) ────────────────────────────────────────────────

const _groupMap = new Map<string, UnifiedGroup>()
const _catMap   = new Map<string, UnifiedCategory>()  // "group:cat" → UnifiedCategory

for (const g of FILTER_GROUPS) {
  _groupMap.set(g.key, g)
  for (const c of g.categories) {
    _catMap.set(`${g.key}:${c.key}`, c)
  }
}

// ─── Resolve active filters into backend-specific query params ──────────────

export function resolveActiveFilters(activeFilters: Set<string>): ResolvedFilters {
  const venueCategories: string[] = []
  const osmCategories:   string[] = []
  const poiGroups        = new Map<string, Set<string>>()
  const geodataLayers    = new Set<string>()

  for (const filterKey of activeFilters) {
    const cat = _catMap.get(filterKey)
    if (!cat) continue

    const groupKey = filterKey.split(':')[0]

    switch (cat.source) {
      case 'venue':
        venueCategories.push(cat.sourceKey)
        break
      case 'osm':
        osmCategories.push(cat.sourceKey)
        break
      case 'poi': {
        // Determine which POI API group this category belongs to
        const group = _groupMap.get(groupKey)
        const apiGroup = group?.poiGroup ?? _poiGroupForCategory(cat.sourceKey)
        if (apiGroup) {
          if (!poiGroups.has(apiGroup)) poiGroups.set(apiGroup, new Set())
          poiGroups.get(apiGroup)!.add(cat.sourceKey)
        }
        break
      }
      case 'geodata':
        geodataLayers.add(cat.sourceKey)
        break
    }
  }

  return { venueCategories, osmCategories, poiGroups, geodataLayers }
}

// Map POI categories that live in cross-source groups (outdoors) to their API group
function _poiGroupForCategory(sourceKey: string): string | null {
  // Categories from nature group
  const natureKeys = ['lake', 'beach', 'forest', 'nature_reserve', 'garden', 'cemetery_park', 'allotment_garden', 'pond']
  if (natureKeys.includes(sourceKey)) return 'nature'

  // Categories from sports group moved to outdoors
  const sportsKeys = ['dog_park', 'skatepark', 'playground']
  if (sportsKeys.includes(sourceKey)) return 'sports'

  return null
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function getGroupColor(groupKey: string): string {
  const group = _groupMap.get(groupKey)
  return group?.categories[0]?.color ?? '#6b7280'
}

export function getFilterLabel(filterKey: string): string {
  return _catMap.get(filterKey)?.label ?? filterKey
}

export function getFilterColor(filterKey: string): { color: string; stroke: string } {
  const cat = _catMap.get(filterKey)
  return cat ? { color: cat.color, stroke: cat.stroke } : { color: '#6b7280', stroke: '#4b5563' }
}

export function getActiveCountForGroup(groupKey: string, activeFilters: Set<string>): number {
  const group = _groupMap.get(groupKey)
  if (!group) return 0
  return group.categories.filter(c => activeFilters.has(`${groupKey}:${c.key}`)).length
}
